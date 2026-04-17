"""
AI Service - Claude API integration with function calling for report generation.

Design decisions:
- Uses Anthropic Python SDK with function calling (tool_use)
- Functions exposed to Claude: get_wazuh_alerts, get_mikrotik_connections,
  get_firewall_rules, get_arp_table to fetch live data during generation
- Audience parameter adjusts system prompt for tone/depth
- HTML output ready for TipTap editor and WeasyPrint PDF export
- Streaming support for long reports to show progress
"""

from __future__ import annotations

import json
from typing import Any

import anthropic
import structlog

from config import get_settings
from services.mikrotik_service import get_mikrotik_service
from services.wazuh_service import get_wazuh_service

logger = structlog.get_logger(__name__)

# ── Tool definitions for Claude function calling ──────────────────

TOOLS = [
    {
        "name": "get_wazuh_alerts",
        "description": "Fetch recent security alerts from Wazuh SIEM. Returns alerts with severity levels, agent info, and descriptions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of alerts to fetch (default: 50)",
                    "default": 50,
                },
                "level_min": {
                    "type": "integer",
                    "description": "Minimum alert level to filter (1-15). Higher = more critical.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_mikrotik_connections",
        "description": "Fetch active network connections from MikroTik router. Returns source/destination IPs, protocols, and connection states.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_firewall_rules",
        "description": "Fetch current firewall filter rules from MikroTik. Returns chain, action, addresses, and packet/byte counters.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_arp_table",
        "description": "Fetch the ARP table from MikroTik router. Returns IP-to-MAC address mappings.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_system_health",
        "description": "Fetch health status from all systems: MikroTik (CPU/RAM/uptime), Wazuh (agents/alerts count), CrowdSec (active decisions), and Suricata (engine status). Use this for status queries.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
]

# ── System prompts by audience ────────────────────────────────────

SYSTEM_PROMPTS = {
    "executive": """You are a senior cybersecurity analyst writing a security report for C-level executives and board members.
Your writing must be:
- Clear, concise, and free of technical jargon
- Focused on business impact, risk levels, and recommended actions
- Use bullet points and summaries over detailed technical analysis
- Include risk ratings (Critical/High/Medium/Low) with business context
- Highlight trends and patterns, not individual events
- End with clear, prioritized recommendations
Output the report as clean HTML suitable for PDF export.""",
    "technical": """You are a senior cybersecurity engineer writing a detailed technical security report for the SOC team.
Your writing must be:
- Technically precise with IP addresses, port numbers, protocols, and rule IDs
- Include IOCs (Indicators of Compromise) when applicable
- Reference specific Wazuh rule IDs and MITRE ATT&CK techniques where relevant
- Provide correlation analysis between different data sources
- Include raw data tables where helpful
- Suggest specific remediation steps with commands/configurations
Output the report as clean HTML suitable for PDF export.""",
    "operational": """You are a network security analyst writing an operational security report for the IT operations team.
Your writing must be:
- Actionable and procedural
- Include specific steps to address each finding
- Balance technical detail with clarity
- Organize by priority and affected systems
- Include relevant network topology context
- Provide checklists for remediation tasks
Output the report as clean HTML suitable for PDF export.""",
}

TELEGRAM_SYSTEM_PROMPT = """You are the NetShield security bot responding to queries via Telegram.
Your responses must be:
- Concise: maximum 500 words, prefer bullet points and short lines
- Use Telegram HTML format: <b>bold</b>, <i>italic</i>, <code>code</code>
- Use emojis for visual hierarchy: 🚨 ✅ ⚠️ 🔒 📊 💻
- NEVER execute destructive actions (block, quarantine, delete)
- Only report information, status, and recommendations
- If asked to perform an action, explain that actions must be taken from the dashboard
- Include relevant numbers, timestamps, and IP addresses when available
- Be helpful and security-focused
"""


class AIService:
    """
    Service for AI-powered report generation using Claude API.
    Uses function calling to fetch live data during report generation.
    """

    def __init__(self) -> None:
        self._settings = get_settings()
        self._client: anthropic.Anthropic | None = None

    def _get_client(self) -> anthropic.Anthropic:
        """Lazy-init the Anthropic client."""
        if self._client is None:
            if not self._settings.anthropic_api_key:
                raise ValueError("ANTHROPIC_API_KEY is not configured")
            self._client = anthropic.Anthropic(
                api_key=self._settings.anthropic_api_key
            )
        return self._client

    async def _execute_tool(self, tool_name: str, tool_input: dict) -> Any:
        """
        Execute a function call requested by Claude.
        Routes to the appropriate service method.
        """
        logger.info("ai_tool_called", tool=tool_name, input=tool_input)

        if tool_name == "get_wazuh_alerts":
            wazuh = get_wazuh_service()
            return await wazuh.get_alerts(
                limit=tool_input.get("limit", 50),
                level_min=tool_input.get("level_min"),
            )
        elif tool_name == "get_mikrotik_connections":
            mt = get_mikrotik_service()
            return await mt.get_connections()
        elif tool_name == "get_firewall_rules":
            mt = get_mikrotik_service()
            return await mt.get_firewall_rules()
        elif tool_name == "get_arp_table":
            mt = get_mikrotik_service()
            return await mt.get_arp_table()
        elif tool_name == "get_system_health":
            return await self._get_system_health()
        else:
            return {"error": f"Unknown tool: {tool_name}"}

    async def generate_report(
        self,
        prompt: str,
        audience: str = "technical",
        attached_documents: list[str] | None = None,
        data_sources: list[str] | None = None,
        date_range: dict | None = None,
    ) -> dict:
        """
        Generate a security report using Claude with function calling.

        The flow:
        1. Send user prompt + system prompt to Claude with available tools
        2. Claude may call tools to fetch live data (alerts, connections, etc.)
        3. Execute tool calls and send results back to Claude
        4. Claude generates the final HTML report

        Returns: {html_content, title, summary, data_sources_used, tokens_used}
        """
        if self._settings.should_mock_anthropic:
            from services.mock_data import MockData
            return MockData.ai.mock_report(prompt=prompt, audience=audience)

        client = self._get_client()
        system_prompt = SYSTEM_PROMPTS.get(audience, SYSTEM_PROMPTS["technical"])

        # Build user message with context
        user_content = f"""Generate a security report based on the following request:

{prompt}

"""
        if attached_documents:
            user_content += "\n\nAttached reference documents:\n"
            for i, doc in enumerate(attached_documents, 1):
                user_content += f"\n--- Document {i} ---\n{doc}\n"

        if date_range:
            user_content += f"\n\nDate range: {date_range.get('from_date', 'N/A')} to {date_range.get('to_date', 'N/A')}\n"

        user_content += """
Please use the available tools to fetch the latest data from our security systems before writing the report.
Structure the report with:
- Title
- Executive Summary
- Key Findings
- Detailed Analysis
- Recommendations
- Appendix (raw data tables if relevant)

Output as clean, well-formatted HTML."""

        # Determine which tools to make available based on data_sources
        available_tools = TOOLS
        if data_sources:
            tool_filter = set()
            source_to_tool = {
                "wazuh_alerts": "get_wazuh_alerts",
                "mikrotik_connections": "get_mikrotik_connections",
                "firewall_rules": "get_firewall_rules",
                "arp_table": "get_arp_table",
            }
            for source in data_sources:
                if source in source_to_tool:
                    tool_filter.add(source_to_tool[source])
            if tool_filter:
                available_tools = [t for t in TOOLS if t["name"] in tool_filter]

        messages = [{"role": "user", "content": user_content}]
        data_sources_used = []
        total_tokens = 0

        # Agentic loop: keep calling until Claude produces final text
        max_iterations = 10  # Safety limit
        for iteration in range(max_iterations):
            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=8192,
                system=system_prompt,
                tools=available_tools,
                messages=messages,
            )

            total_tokens += response.usage.input_tokens + response.usage.output_tokens

            # Check if Claude wants to use tools
            if response.stop_reason == "tool_use":
                # Process all tool calls in this response
                tool_results = []
                for block in response.content:
                    if block.type == "tool_use":
                        tool_result = await self._execute_tool(
                            block.name, block.input
                        )
                        data_sources_used.append(block.name)
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": json.dumps(
                                tool_result, default=str, ensure_ascii=False
                            )[:50000],  # Truncate very large results
                        })

                # Add assistant response and tool results to conversation
                messages.append({"role": "assistant", "content": response.content})
                messages.append({"role": "user", "content": tool_results})
            else:
                # Claude produced final text response
                break

        # Extract HTML content from final response
        html_content = ""
        for block in response.content:
            if hasattr(block, "text"):
                html_content += block.text

        # Extract title from HTML if present
        title = "NetShield Security Report"
        if "<h1>" in html_content and "</h1>" in html_content:
            start = html_content.index("<h1>") + 4
            end = html_content.index("</h1>")
            title = html_content[start:end].strip()
            # Remove HTML tags from title
            import re
            title = re.sub(r"<[^>]+>", "", title)

        # Generate summary (first paragraph or first 200 chars)
        summary = prompt[:200]

        logger.info(
            "ai_report_generated",
            audience=audience,
            tools_used=data_sources_used,
            tokens=total_tokens,
            iterations=iteration + 1,
        )

        return {
            "html_content": html_content,
            "title": title,
            "summary": summary,
            "data_sources_used": list(set(data_sources_used)),
            "tokens_used": total_tokens,
        }

    async def _get_system_health(self) -> dict:
        """Aggregate health data from all services for Telegram bot queries."""
        result = {}
        try:
            mt = get_mikrotik_service()
            result["mikrotik"] = await mt.get_health()
        except Exception as e:
            result["mikrotik"] = {"error": str(e)}
        try:
            wazuh = get_wazuh_service()
            agents = await wazuh.get_agents()
            alerts = await wazuh.get_alerts(limit=100)
            active_agents = sum(1 for a in agents if a.get("status") == "active")
            critical = sum(1 for a in alerts if int(a.get("rule_level", 0)) >= 12)
            result["wazuh"] = {
                "total_agents": len(agents),
                "active_agents": active_agents,
                "alerts_count": len(alerts),
                "critical_alerts": critical,
            }
        except Exception as e:
            result["wazuh"] = {"error": str(e)}
        try:
            from services.crowdsec_service import get_crowdsec_service
            cs = get_crowdsec_service()
            decisions = await cs.get_decisions()
            result["crowdsec"] = {"active_decisions": len(decisions)}
        except Exception as e:
            result["crowdsec"] = {"error": str(e)}
        try:
            from services.suricata_service import get_suricata_service
            sur = get_suricata_service()
            status = await sur.get_engine_status()
            result["suricata"] = status
        except Exception as e:
            result["suricata"] = {"error": str(e)}
        return result

    async def answer_telegram_query(self, query: str, chat_id: str) -> str:
        """
        Answer a Telegram bot query using Claude with all tools available.
        Returns plain text (Telegram HTML) instead of full HTML report.
        """
        if self._settings.should_mock_anthropic:
            from services.mock_data import MockData
            return MockData.telegram.bot_query_response(query)

        client = self._get_client()
        user_content = (
            f"User query from Telegram (chat_id: {chat_id}):\n\n{query}\n\n"
            "Use the available tools to fetch current data before answering. "
            "Respond concisely in Telegram HTML format."
        )

        messages = [{"role": "user", "content": user_content}]
        total_tokens = 0

        # Agentic loop (same pattern as generate_report but with lower token limit)
        for iteration in range(5):  # Max 5 tool calls for Telegram
            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=2048,
                system=TELEGRAM_SYSTEM_PROMPT,
                tools=TOOLS,
                messages=messages,
            )
            total_tokens += response.usage.input_tokens + response.usage.output_tokens

            if response.stop_reason == "tool_use":
                tool_results = []
                for block in response.content:
                    if block.type == "tool_use":
                        tool_result = await self._execute_tool(block.name, block.input)
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": json.dumps(
                                tool_result, default=str, ensure_ascii=False
                            )[:20000],
                        })
                messages.append({"role": "assistant", "content": response.content})
                messages.append({"role": "user", "content": tool_results})
            else:
                break

        # Extract text response
        text = ""
        for block in response.content:
            if hasattr(block, "text"):
                text += block.text

        logger.info(
            "ai_telegram_query_answered",
            query=query[:50],
            tokens=total_tokens,
            iterations=iteration + 1,
        )

        return text


def get_ai_service() -> AIService:
    """Get an AI service instance."""
    return AIService()

# services/mcp-gateway/app/handlers/__init__.py
from .wallet_sign       import handle_wallet_sign
from .supply_chain      import handle_supply_chain
from .contract_simulate import handle_contract_simulate
from .bridge_initiate   import handle_bridge_initiate
from .audit_log         import handle_audit_log

HANDLERS = {
    "wallet_sign_transaction":    handle_wallet_sign,
    "supply_chain_api_query":     handle_supply_chain,
    "contract_call_simulate":     handle_contract_simulate,
    "cross_chain_bridge_initiate": handle_bridge_initiate,
    "audit_log_write":            handle_audit_log,
}

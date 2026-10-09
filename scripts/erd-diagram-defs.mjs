// Diagram definitions shared by the ERD document and the reading guide.
// Full entities draw their attribute table; "~NAME" is defined in another diagram and appears name-only.
export const DIAGRAMS = [
  { id: "1a", title: "Configuration — project, parties, receiver groups and wallet screening", nodes: [
      "PROJECT", "MARKUP_SHARE_PARTY", "RATE_SOURCE", "SENDER", "RECEIVER_GROUP", "OWN_WALLET", "THRESHOLD", "CURRENCY_PAIR",
      "COLLECTION_SENDING_ENTITY", "SENDER_RECEIVER_ALLOW", "RECEIVER", "PAIR_RATE_SOURCE", "MARKUP_SHARE_RULE", "RECEIVING_ENTITY", "RECEIVING_ENTITY_ACCOUNT", "WALLET_SCREENING", "MESSAGE_TEMPLATE",
      "~PARTNER_CONFIG", "~PARTNER_PAIR", "~DESTINATION_APPROVAL", "~FEE_STRUCTURE"] },
  { id: "1b", title: "Configuration — partner configuration block, fees and tiers", nodes: [
      "PARTNER", "PARTNER_CUTOFF_OVERRIDE", "HOLIDAY", "PARTNER_CONFIG", "PARTNER_PAIR", "PARTNER_ENTITY", "COLLECTION_RECEIVING_ENDPOINT", "SETTLEMENT_SENDING_ENTITY", "SETTLEMENT_RAIL",
      "DESTINATION_APPROVAL", "PARTNER_REBATE_RULE", "FEE_STRUCTURE", "FEE_OVERRIDE", "FEE_TIER",
      "~PROJECT", "~CURRENCY_PAIR", "~SENDER", "~RECEIVING_ENTITY_ACCOUNT", "~OWN_WALLET"] },
  { id: "2", title: "Rates", nodes: [
      "MARKET_RATE", "RATE_COMPARISON", "PARTNER_RATE_VERSION", "~RATE_SOURCE", "~CURRENCY_PAIR", "~PARTNER_PAIR", "~DEAL", "~CONVERSION", "~BALANCE_CONVERSION"] },
  { id: "3a", title: "Deal lifecycle — deal group, legs, pricing stamps, invoice, collection", nodes: [
      "DEAL_GROUP", "DEAL", "DEAL_FEE_TIER", "INVOICE", "COLLECTION", "SENDER_CREDIT", "QUOTE_PACKAGE",
      "~PROJECT", "~SENDER", "~RECEIVER_GROUP", "~RECEIVER", "~PARTNER_PAIR", "~PARTNER_ENTITY", "~FEE_STRUCTURE", "~FEE_OVERRIDE", "~FEE_TIER",
      "~COLLECTION_SENDING_ENTITY", "~COLLECTION_RECEIVING_ENDPOINT", "~WALLET_SCREENING", "~MESSAGE_TEMPLATE"],
    noSelf: ["QUOTE_PACKAGE"] },
  { id: "3b", title: "Deal lifecycle — conversion, reroute, earnings receivable, balance conversion, entitlement re-attribution", nodes: [
      "CONVERSION", "REROUTE", "EARNINGS_RECEIVABLE", "BALANCE_CONVERSION", "ENTITLEMENT_REATTRIBUTION",
      "~DEAL", "~PROJECT", "~RECEIVER_GROUP", "~OWN_WALLET", "~PARTNER_CONFIG", "~PARTNER_PAIR", "~PARTNER_RATE_VERSION", "~MARKET_RATE"] },
  { id: "3c", title: "Settlement, return, confirmation, fees, referrals, rebates and loss events", nodes: [
      "SETTLEMENT", "SETTLEMENT_LINE", "BANK_FEE_EVENT", "SETTLEMENT_RETURN", "CONFIRMATION", "SHORTFALL", "FEE_DECISION", "MARKUP_SHARE_ACCRUAL", "PARTNER_REBATE_ACCRUAL", "LOSS_EVENT",
      "~PROJECT", "~PARTNER_CONFIG", "~SETTLEMENT_SENDING_ENTITY", "~SETTLEMENT_RAIL", "~DESTINATION_APPROVAL", "~RECEIVER", "~DEAL", "~COLLECTION", "~INVOICE", "~MARKET_RATE", "~BALANCE_CONVERSION", "~MARKUP_SHARE_RULE", "~PARTNER_REBATE_RULE"] },
  { id: "4", title: "Ledger & controls", nodes: [
      "LEDGER_TRANSACTION", "LEDGER_POSTING", "LEDGER_ACCOUNT", "USER", "APPROVAL", "AUDIT_LOG", "RECORD_LOCK",
      "~COLLECTION", "~CONVERSION", "~BALANCE_CONVERSION", "~SETTLEMENT", "~SETTLEMENT_RETURN", "~CONFIRMATION", "~BANK_FEE_EVENT", "~REROUTE",
      "~MARKUP_SHARE_ACCRUAL", "~PARTNER_REBATE_ACCRUAL", "~LOSS_EVENT", "~PARTNER_CONFIG", "~OWN_WALLET", "~RECEIVER", "~SENDER", "~MARKUP_SHARE_PARTY"] },
];
export const homeOf = {};
for (const dg of DIAGRAMS) for (const n of dg.nodes) if (!n.startsWith("~")) homeOf[n] = dg.id;

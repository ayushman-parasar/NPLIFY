// Diagram definitions shared by the ERD document and the reading guide.
// Full entities draw their attribute table; "~NAME" is defined in another diagram and appears name-only.
export const DIAGRAMS = [
  { id: "1a", title: "Configuration — project, parties, receiver groups and wallet screening", nodes: [
      "PROJECT", "INTRODUCER", "RATE_SOURCE", "SENDER", "RECEIVER_GROUP", "OWN_WALLET", "THRESHOLD", "CURRENCY_PAIR",
      "COLLECTION_SENDING_ENTITY", "SENDER_RECEIVER_ALLOW", "RECEIVER", "PAIR_RATE_SOURCE", "REFERRAL_RULE", "RECEIVING_ENTITY", "RECEIVING_ENTITY_ACCOUNT", "WALLET_SCREENING",
      "~PARTNER_CONFIG", "~PARTNER_PAIR", "~SETTLEMENT_REGISTRATION", "~FEE_STRUCTURE"] },
  { id: "1b", title: "Configuration — partner configuration block, fees and tiers", nodes: [
      "PARTNER", "PARTNER_CONFIG", "PARTNER_PAIR", "PARTNER_ENTITY", "COLLECTION_RECEIVING_ENDPOINT", "SETTLEMENT_SENDING_ENTITY", "SETTLEMENT_RAIL",
      "SETTLEMENT_REGISTRATION", "PARTNER_REBATE_RULE", "FEE_STRUCTURE", "FEE_OVERRIDE", "FEE_TIER",
      "~PROJECT", "~CURRENCY_PAIR", "~SENDER", "~RECEIVING_ENTITY_ACCOUNT", "~OWN_WALLET"] },
  { id: "2", title: "Rates", nodes: [
      "MARKET_RATE", "RATE_COMPARISON", "PARTNER_RATE_VERSION", "~RATE_SOURCE", "~CURRENCY_PAIR", "~PARTNER_PAIR", "~DEAL", "~CONVERSION", "~BALANCE_CONVERSION"] },
  { id: "3a", title: "Deal lifecycle — deal group, legs, pricing stamps, invoice, collection", nodes: [
      "DEAL_GROUP", "DEAL", "DEAL_FEE_TIER", "INVOICE", "COLLECTION", "SENDER_CREDIT",
      "~PROJECT", "~SENDER", "~RECEIVER_GROUP", "~RECEIVER", "~PARTNER_PAIR", "~PARTNER_ENTITY", "~FEE_STRUCTURE", "~FEE_OVERRIDE", "~FEE_TIER",
      "~COLLECTION_SENDING_ENTITY", "~COLLECTION_RECEIVING_ENDPOINT", "~WALLET_SCREENING"] },
  { id: "3c", title: "Deal lifecycle — conversion, reroute, earnings receivable, balance conversion, entitlement re-attribution", nodes: [
      "CONVERSION", "REROUTE", "EARNINGS_RECEIVABLE", "BALANCE_CONVERSION", "ENTITLEMENT_REATTRIBUTION",
      "~DEAL", "~PROJECT", "~RECEIVER_GROUP", "~OWN_WALLET", "~PARTNER_CONFIG", "~PARTNER_PAIR", "~PARTNER_RATE_VERSION", "~MARKET_RATE"] },
  { id: "3b", title: "Disbursement, return, confirmation, fees, referrals, rebates and loss events", nodes: [
      "DISBURSEMENT", "DISBURSEMENT_LINE", "BANK_FEE_EVENT", "DISBURSEMENT_RETURN", "CONFIRMATION", "SHORTFALL", "FEE_DECISION", "REFERRAL_ACCRUAL", "PARTNER_REBATE_ACCRUAL", "LOSS_EVENT",
      "~PROJECT", "~PARTNER_CONFIG", "~SETTLEMENT_SENDING_ENTITY", "~SETTLEMENT_RAIL", "~SETTLEMENT_REGISTRATION", "~RECEIVER", "~DEAL", "~COLLECTION", "~INVOICE", "~MARKET_RATE", "~BALANCE_CONVERSION", "~REFERRAL_RULE", "~PARTNER_REBATE_RULE"] },
  { id: "4", title: "Ledger & controls", nodes: [
      "LEDGER_TRANSACTION", "LEDGER_POSTING", "LEDGER_ACCOUNT", "USER", "APPROVAL", "AUDIT_LOG", "RECORD_LOCK",
      "~COLLECTION", "~CONVERSION", "~BALANCE_CONVERSION", "~DISBURSEMENT", "~DISBURSEMENT_RETURN", "~CONFIRMATION", "~BANK_FEE_EVENT", "~REROUTE",
      "~REFERRAL_ACCRUAL", "~PARTNER_REBATE_ACCRUAL", "~LOSS_EVENT", "~PARTNER_CONFIG", "~OWN_WALLET", "~RECEIVER", "~SENDER", "~INTRODUCER"] },
];
export const homeOf = {};
for (const dg of DIAGRAMS) for (const n of dg.nodes) if (!n.startsWith("~")) homeOf[n] = dg.id;

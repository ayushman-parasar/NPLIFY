// Diagram definitions shared by the ERD document and the reading guide.
// Full entities draw their attribute table; "~NAME" is defined in another diagram and appears name-only.
export const DIAGRAMS = [
  { id: "1a", title: "Configuration — project, parties and receiver groups", nodes: [
      "PROJECT", "INTRODUCER", "RATE_SOURCE", "SENDER", "RECEIVER_GROUP", "OWN_WALLET", "THRESHOLD", "CURRENCY_PAIR",
      "COLLECTION_SENDING_ENTITY", "SENDER_RECEIVER_ALLOW", "RECEIVER", "PAIR_RATE_SOURCE", "REFERRAL_RULE", "RECEIVING_ENTITY", "RECEIVING_ENTITY_ACCOUNT",
      "~PARTNER_CONFIG", "~PARTNER_PAIR", "~SETTLEMENT_REGISTRATION"] },
  { id: "1b", title: "Configuration — partner configuration block", nodes: [
      "PARTNER", "PARTNER_CONFIG", "PARTNER_PAIR", "PARTNER_ENTITY", "COLLECTION_RECEIVING_ENDPOINT", "SETTLEMENT_SENDING_ENTITY", "SETTLEMENT_RAIL",
      "SETTLEMENT_REGISTRATION", "PARTNER_REBATE_RULE", "FEE_STRUCTURE", "FEE_OVERRIDE",
      "~PROJECT", "~CURRENCY_PAIR", "~SENDER", "~RECEIVING_ENTITY_ACCOUNT"] },
  { id: "2", title: "Rates", nodes: [
      "MARKET_RATE", "RATE_COMPARISON", "PARTNER_RATE_VERSION", "~RATE_SOURCE", "~CURRENCY_PAIR", "~PARTNER_PAIR", "~DEAL", "~CONVERSION", "~BALANCE_CONVERSION"] },
  { id: "3a", title: "Deal lifecycle — deal group, legs, collection, conversion, reroute, balance conversion", nodes: [
      "DEAL_GROUP", "DEAL", "COLLECTION", "CONVERSION", "REROUTE", "SENDER_CREDIT", "EARNINGS_RECEIVABLE", "BALANCE_CONVERSION", "ENTITLEMENT_REATTRIBUTION",
      "~PROJECT", "~SENDER", "~RECEIVER_GROUP", "~PARTNER_PAIR", "~PARTNER_ENTITY", "~FEE_STRUCTURE", "~MARKET_RATE", "~PARTNER_RATE_VERSION",
      "~OWN_WALLET", "~PARTNER_CONFIG", "~COLLECTION_SENDING_ENTITY", "~COLLECTION_RECEIVING_ENDPOINT", "~DISBURSEMENT_RETURN", "~RECEIVER"] },
  { id: "3b", title: "Disbursement, return, confirmation, fees, referrals and rebates", nodes: [
      "DISBURSEMENT", "DISBURSEMENT_LINE", "BANK_FEE_EVENT", "DISBURSEMENT_RETURN", "CONFIRMATION", "SHORTFALL", "FEE_DECISION", "REFERRAL_ACCRUAL", "PARTNER_REBATE_ACCRUAL",
      "~PROJECT", "~PARTNER_CONFIG", "~SETTLEMENT_SENDING_ENTITY", "~SETTLEMENT_RAIL", "~SETTLEMENT_REGISTRATION", "~RECEIVER", "~DEAL", "~BALANCE_CONVERSION", "~REFERRAL_RULE", "~PARTNER_REBATE_RULE"] },
  { id: "4", title: "Ledger & controls", nodes: [
      "LEDGER_TRANSACTION", "LEDGER_POSTING", "LEDGER_ACCOUNT", "USER", "APPROVAL", "AUDIT_LOG", "RECORD_LOCK",
      "~COLLECTION", "~CONVERSION", "~BALANCE_CONVERSION", "~DISBURSEMENT", "~DISBURSEMENT_RETURN", "~CONFIRMATION", "~BANK_FEE_EVENT", "~REROUTE",
      "~REFERRAL_ACCRUAL", "~PARTNER_REBATE_ACCRUAL", "~PARTNER_CONFIG", "~OWN_WALLET", "~RECEIVER", "~SENDER", "~INTRODUCER"] },
];
export const homeOf = {};
for (const dg of DIAGRAMS) for (const n of dg.nodes) if (!n.startsWith("~")) homeOf[n] = dg.id;

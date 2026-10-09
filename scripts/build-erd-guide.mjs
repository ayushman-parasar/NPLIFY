// Build docs/NPLify-ERD-Reading-Guide-v<n>.pdf: a plain-language companion to the ERD, one chapter per
// diagram (the diagram itself, what it is about, how to read it, every box in one line, the lines that
// matter, one story walked through it). Diagrams and entity lists come from data/erd.v5.json, so the
// guide cannot drift from the ERD.   node scripts/build-erd-guide.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { D, erDiagram, renderSvgs, stubNote } from "./mermaid-diagrams.mjs";
import { DIAGRAMS, homeOf } from "./erd-diagram-defs.mjs";
import { ROLE } from "./erd-diagrams.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outDir = path.join(root, "docs");
const GUIDE_V = "1.0", DATE = "8 October 2026";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const c = (s) => `<code>${esc(s)}</code>`;

// Why each table exists — the second sentence after its one-line role.
const WHY = {
  PROJECT: "Everything else hangs off it; a client with two unrelated flows would be two projects.",
  PARTNER: "Set up once; how a partner is used in a given project lives in PARTNER_CONFIG, not here.",
  RATE_SOURCE: "Each source has a staleness limit; a snapshot older than that is not used for pricing.",
  MARKUP_SHARE_PARTY: "Only needed where NPL pays a referral commission.",
  SENDER: "The person or company that pays money in. Not tied to a partner.",
  RECEIVER_GROUP: "The unit entitlement is tracked on. Payouts within a group are ordinary; payouts across groups are offsets.",
  RECEIVER: "Three kinds: a client counterparty (has a group), the sender's own refund destination, or a partner's endpoint used as the hop of a two-partner route (no group).",
  OWN_WALLET: "Only used under an approved reroute; the custody view keeps it honest.",
  THRESHOLD: "Amounts, slots and rate variations that send an action to Finance or Management.",
  CURRENCY_PAIR: "Carries the quote direction, precision and the whole-unit rounding rule.",
  PARTNER_CONFIG: "“Ali as used by Client 1”: fees, vehicles, endpoints, narratives, rails, approvals and rebate terms all hang off it.",
  COLLECTION_SENDING_ENTITY: "Provenance only — where a sender's funds came from. Never a payout destination.",
  SENDER_RECEIVER_ALLOW: "Required before a sender can be chosen on a deal; it also attributes collect-first deals.",
  RECEIVING_ENTITY: "A receiver may have several legal entities; each has its own accounts.",
  PAIR_RATE_SOURCE: "A priority chain: if the first source is stale or down, the next is tried.",
  PARTNER_PAIR: "Which currency pairs this partner handles for this project, and whether its price includes its margin or states it separately.",
  SETTLEMENT_SENDING_ENTITY: "Purely the sender name the receiver's bank shows. Holds no money and no account details.",
  SETTLEMENT_RAIL: "The road a payout travels, with the bank fee NPL expects on it. Holds no money.",
  FEE_OVERRIDE: "Replaces the fee's total percentage for one sender on one pair.",
  RECEIVING_ENTITY_ACCOUNT: "Bank account (bank reference + bank rail) or wallet (network + address + crypto rail). EUR via SWIFT and EUR via SEPA are two accounts.",
  DESTINATION_APPROVAL: "A partner pays an account only once it has approved it; the registration is the partner's copy of the details, in the account's kind.",
  FEE_STRUCTURE: "Versioned: a new fee is a new row with a later effective date; deals keep the version they were priced on.",
  MARKUP_SHARE_RULE: "Either a percentage added to the sender share or a share of NPL's earnings.",
  PARTNER_REBATE_RULE: "Drives the monthly partner-commission reconciliation.",
  PARTNER_ENTITY: "The name on the paperwork (PT-tour, PT Global Inc). Fixed on a deal leg at quote; only a reroute changes it.",
  COLLECTION_RECEIVING_ENDPOINT: "Bank or wallet by kind; a bank endpoint cannot be used until its rail is known.",
  MARKET_RATE: "What the market said at one moment, from one source. Never edited.",
  RATE_COMPARISON: "One per partner × pair × day, created by the first deal that needs it and reused all day.",
  PARTNER_RATE_VERSION: "A day can hold several; a breached version freezes the pair until Finance decides.",
  DEAL_GROUP: "One row, one quote toward the client, one entitled group — even when the route needs two partners.",
  DEAL: "A leg carries its own partner, prices and state; a route is several legs; a refund is a return leg.",
  COLLECTION: "Each part is verified separately; return legs and second legs have no collection — their money is already inside.",
  CONVERSION: "Exactly one owner (a leg or a balance conversion); the one moment money changes from client to company.",
  REROUTE: "Approved contingency: through NPL's own wallet to an alternate partner, optionally netting dues the partner owes NPL.",
  SENDER_CREDIT: "An overpayment or a refund waiting to be paid back.",
  EARNINGS_RECEIVABLE: "NPL's cut that a partner still holds; recovered on the partner's fee cycle or by netting on a reroute.",
  BALANCE_CONVERSION: "Finance requests, Management approves; it owns its own conversion and names the group it serves.",
  ENTITLEMENT_REATTRIBUTION: "Moves one group's entitlement from the old currency to the new one.",
  SETTLEMENT: "One run drains one partner's holding through one rail under one sender name, in whole units.",
  SETTLEMENT_LINE: "Points at an approved registration and at the leg it settles; a line to a group-less receiver must name its leg.",
  SETTLEMENT_RETURN: "The money is back at the partner minus bank fees; it waits in balance or funds a return leg.",
  CONFIRMATION: "Full or short; short opens a shortfall.",
  SHORTFALL: "Topped up with the next settlement, funded from NPL's pool with Management approval.",
  BANK_FEE_EVENT: "Expected versus actual fee, waived / carried forward / absorbed; also the bounce fee on a returned line.",
  FEE_DECISION: "One subject only — a return leg, a balance conversion or a payment run; standing rules stay in the fee structure.",
  MARKUP_SHARE_ACCRUAL: "Paid out of NPL's earnings.",
  PARTNER_REBATE_ACCRUAL: "Reconciled monthly against the partner's statement, usually received in crypto.",
  LEDGER_TRANSACTION: "Append-only; a correction is a new transaction that names the one it reverses.",
  LEDGER_POSTING: "Its lines add to zero per currency; each carries whose money it is and what kind of cost it is.",
  LEDGER_ACCOUNT: "Owner (client or company), where the money is, the currency, and what it is for.",
  USER: "Operations, Finance or Management; Operations never sees derived economics.",
  APPROVAL: "Requested, approved, rejected or escalated; the approver is never the requester.",
  AUDIT_LOG: "Field-level history of every change, with the acting user.",
  RECORD_LOCK: "Prevents two people editing the same record at once.",
  PROJECT_BALANCE: "How much client money sits at a partner, per currency — a sum over postings, never stored.",
  GROUP_ENTITLEMENT: "How much of the client's money belongs to each group — a sum over converted legs and payout lines.",
  OFFSET: "Entitlement minus paid, per group; non-zero only when a counterparty was paid from another group's leg.",
  CUSTODY: "What sits in NPL's own wallet under open reroutes, and for how long.",
};
for (const n of Object.keys(D.E)) if (!WHY[n]) throw new Error("no WHY for " + n);

// ------------------------------------------------------------------ chapters
const CH = {
  "1a": {
    about: `This is the address book and the rulebook for one client. It answers: who is the client, who is allowed to pay money in, who may be paid, and under what settings. Everything in it is <i>configuration</i> — set up once, changed under approval, read by every deal.`,
    read: `Start at ${c("PROJECT")} in the middle: the client and its settings. Everything with a line back to it belongs to that client. Then follow the two “who” chains. On the sending side, ${c("SENDER")} → ${c("SENDER_RECEIVER_ALLOW")} says who pays in and which groups they may pay. On the receiving side, ${c("RECEIVER_GROUP")} → ${c("RECEIVER")} → ${c("RECEIVING_ENTITY")} → ${c("RECEIVING_ENTITY_ACCOUNT")} is the four-level “address” of a payout: the pot, the party, its legal entity, the specific bank account or wallet. The grey boxes at the edge (${c("PARTNER_CONFIG")}, ${c("PARTNER_PAIR")}, ${c("DESTINATION_APPROVAL")}) are where Diagram 1b plugs in.`,
    lines: [
      [`${c("PROJECT")} → almost everything`, "The project owns its settings, pairs, thresholds, senders, groups and partner configurations. Delete the project and all of it goes."],
      [`${c("RECEIVER_GROUP")} → ${c("RECEIVER")} (counterparty only)`, "A client counterparty always sits in exactly one group — the pot its money is tracked in. The other two receiver kinds (a sender's refund destination, a partner's transit endpoint) have no group: a payment to them is charged to the pot of the deal leg that pays them."],
      [`${c("RECEIVER")} → ${c("RECEIVING_ENTITY")} → ${c("RECEIVING_ENTITY_ACCOUNT")}`, "Three levels because they change at different speeds: the party you deal with rarely changes, its legal entities occasionally, its accounts often (and EUR via SEPA and EUR via SWIFT are two accounts)."],
      [`${c("SENDER")} → ${c("SENDER_RECEIVER_ALLOW")} → ${c("RECEIVER_GROUP")}`, "The allow-list: a sender may only pay the groups listed. It is also how a collect-first deal — money that arrives before any quote — is attributed to a pot."],
      [`${c("CURRENCY_PAIR")} → ${c("PAIR_RATE_SOURCE")} → ${c("RATE_SOURCE")}`, "Which market source prices which pair, in priority order, so a stale feed falls through to the next one."],
    ],
    story: `Setting up “Client 1”. Finance creates the project with its quote clocks (fresh for 5 minutes, valid for 60, 15 minutes of grace) and its policies (settle to zero, bank fees carried forward). The default receiver group is created with it. One currency pair, USDT → EUR, priced from Kraken first and CoinMarketCap second. Two senders, Sender A and Sender B, each allowed to pay the default group. Two receivers, Receiver X and Receiver Y — Receiver X with two legal entities (Entity X1, Entity X2), each with a EUR account over SEPA; Receiver Y with VoiceAIWrapper and a EUR account over SWIFT. Nothing here mentions a partner yet: the same set-up works whether Ali or Jeton does the converting.`,
    confusions: [
      "Receiver, receiving entity and account are three different things: the party you pay, its legal company, and the specific account money lands in.",
      "A group is not a “type” of receiver; it is a pot of entitlement. Most projects have exactly one, the default.",
      "A sender's return destination is a receiver too (kind sender_return) — that is how refunds go through the ordinary payout path with the partner's approval — but it belongs to no group.",
    ],
  },
  "1b": {
    about: `One block per partner a client uses: how Ali, or Jeton, is used <i>for this client</i>. ${c("PARTNER")} is global and set up once; ${c("PARTNER_CONFIG")} is “that partner as used in this project”, and everything a deal needs from the partner hangs off it — prices, legal vehicles, the accounts money arrives in, the road and the name money goes out under, and which client accounts the partner has approved paying.`,
    read: `Read it in two halves around ${c("PARTNER_CONFIG")}. The <b>pricing</b> half: ${c("PARTNER_PAIR")} (which pairs this partner handles and whether its rate hides its margin or states it) → ${c("FEE_STRUCTURE")} (NPL's fee for that pair, versioned) and ${c("FEE_OVERRIDE")} (a sender-specific fee). The <b>money-movement</b> half: on the way in, ${c("PARTNER_ENTITY")} (the partner's legal vehicle) owns the ${c("COLLECTION_RECEIVING_ENDPOINT")}s a sender pays into; on the way out, ${c("SETTLEMENT_SENDING_ENTITY")} (the name on the transfer), ${c("SETTLEMENT_RAIL")} (the bank that executes it) and ${c("DESTINATION_APPROVAL")} (a client account the partner has approved paying). ${c("PARTNER_REBATE_RULE")} is the rebate the partner pays NPL.`,
    lines: [
      [`${c("PARTNER_PAIR")} → ${c("FEE_STRUCTURE")}`, "NPL's fee is per partner × pair, so choosing the partner is part of pricing a deal; the structure is versioned and a deal keeps the version it was priced on."],
      [`${c("PARTNER_ENTITY")} → ${c("COLLECTION_RECEIVING_ENDPOINT")}`, "A bank account is always in some legal entity's name, so every endpoint — bank or wallet — belongs to a vehicle. The endpoint's kind decides which fields it needs; a bank endpoint cannot be used until its rail is known."],
      [`${c("RECEIVING_ENTITY_ACCOUNT")} → ${c("DESTINATION_APPROVAL")}`, "The same client account is registered separately with each partner that may pay it; the registration carries the details as the partner holds them, in the account's kind (bank reference, or network and address). A quote cannot leave Inquiry until the entitled group has an approved registration with the chosen partner."],
      [`${c("SETTLEMENT_SENDING_ENTITY")} and ${c("SETTLEMENT_RAIL")} → ${c("SETTLEMENT")} (Diagram 3b)`, "A payment run stamps the name it goes out under and the road it travels. Neither of these holds money or account details."],
    ],
    story: `Ali for Client 1. Ali's rate includes its margin (disclosed-rate pricing), so PARTNER_PAIR USDT-EUR says so and the fee structure is NPL's 1.00 % — 0.40 % charged to the sender, 0.60 % to the receiver. Ali operates through two vehicles, PT-tour and PT Global Inc, each with a USDT wallet endpoint on TRC-20. Payouts leave through “Ali's EU bank / EMI” (expected bank fee 25 EUR) under the name “PT Global Inc”. Receiver X’s two accounts and Receiver Y’s account are registered with Ali and approved, so any quote through Ali may proceed. Jeton has its own block: market + 0.50 % pricing, one vehicle, its own rail, its own registrations of the same three accounts.`,
    confusions: [
      "SETTLEMENT_SENDING_ENTITY is the from-label on an outgoing transfer, not the destination; the destination is the receiving entity's account via its registration.",
      "“Collection” means money coming in (sender → partner); “settlement” means money going out (partner → receiver). Each direction has its own from and to records, and after v5.1 the two sides mirror each other: config → entity → endpoint, and group → receiver → entity → account.",
      "The registration is the partner's view of a destination; the account row is NPL's. Keeping both is how a wrong wallet address is caught before paying.",
    ],
  },
  "2": {
    about: `The prices. Three things are recorded: what the market said (a snapshot), what a partner offered (a version), and the day's comparison between them for each partner and pair. Nothing here is ever edited; a new price is a new row, and every deal, conversion and balance conversion stamps the exact rows it used.`,
    read: `Left to right: ${c("RATE_SOURCE")} and ${c("CURRENCY_PAIR")} (from Diagram 1a) feed ${c("MARKET_RATE")}, a snapshot of one source for one pair at one moment. ${c("RATE_COMPARISON")} is one row per partner × pair × day; it is created by the first deal that needs it and reused by every deal that day. ${c("PARTNER_RATE_VERSION")} is one rate a partner gave during that day — a day can hold several. The grey boxes on the right (${c("DEAL")}, ${c("CONVERSION")}, ${c("BALANCE_CONVERSION")}) are the consumers: each stamps the snapshot and the version it priced on.`,
    lines: [
      [`${c("RATE_COMPARISON")} → ${c("PARTNER_RATE_VERSION")}`, "Versions belong to the day's comparison. A version is breached when its spread against the two-week average exceeds the pair's tolerance; quoting and conversion on that partner × pair freeze until Finance approves it with a reason, rejects it, or asks the partner for a better rate — which is simply another version."],
      [`${c("MARKET_RATE")} and ${c("PARTNER_RATE_VERSION")} → ${c("DEAL")}`, "A quote-first leg stamps both at quote time. That stamp is the audit trail: six months later you can see exactly which market print and which partner offer a price was built on."],
      [`${c("PARTNER_RATE_VERSION")} → ${c("CONVERSION")}`, "The conversion names the exact version it executed at — which may be a later version than the quote's, and the difference is visible."],
    ],
    story: `Monday 09:00, Ops quotes USDT → EUR through PT. The engine takes a Kraken snapshot (0.9000), finds no comparison row for PT × USDT-EUR × today and creates one, records PT's offered rate 0.8950 as version 1, checks the spread against the rolling average, and stamps the deal with the snapshot and the version. At 14:00 PT improves to 0.8930: that is version 2 of the same day; the morning deal still shows version 1, and a deal converted that afternoon shows version 2. Had version 2 been far off the average, the pair would have frozen and the afternoon deal would have waited for Finance.`,
    confusions: [
      "A market rate is a snapshot (one source, one moment); a partner rate is a version (one offer, one day, possibly one of several).",
      "Rolling averages are built from confirmed versions only, so a rejected outlier does not poison the next day's check.",
    ],
  },
  "3a": {
    about: `The life story of one money transfer, first half: the money coming in and being exchanged. It covers the client's order, the legs that carry it out, the money arriving for a leg, the exchange that converts it, plan B when money is stuck, and the special case of exchanging money that is already held with no order behind it.`,
    read: `Start at ${c("DEAL_GROUP")} — the order, what the client asked for (“get €10,000 to Spain”), one quote toward the client, one entitled group. Then ${c("DEAL")} — one leg of that order: one partner, one currency pair, one conversion. A plain deal is a group of one leg; a route that needs two partners (INR → USDT at Ali, then USDT → EUR at Jeton) is two legs, and the little arrow from DEAL to itself is leg 2 saying “my money comes from leg 1”. A refund is a <i>return</i> leg, funded by a payout that bounced (the arrow from ${c("SETTLEMENT_RETURN")}). Then follow the leg to the right: ${c("COLLECTION")} is money actually arriving, in parts; ${c("CONVERSION")} is the exchange. ${c("REROUTE")}, ${c("SENDER_CREDIT")} and ${c("EARNINGS_RECEIVABLE")} are side records that hang off a leg. ${c("BALANCE_CONVERSION")} and ${c("ENTITLEMENT_REATTRIBUTION")} are the exchange-without-an-order case.`,
    lines: [
      [`The many lines into ${c("DEAL")} (PARTNER_PAIR, PARTNER_ENTITY, FEE_STRUCTURE, MARKET_RATE, PARTNER_RATE_VERSION)`, "This is the receipt. At quote time the system photographs every choice and price and staples the copies to the leg. If the fee table changes next week, this deal still shows the fee it was actually quoted at. So DEAL looks busy, but it is just one hop plus its frozen receipt."],
      [`${c("DEAL")} → ${c("COLLECTION")} (1..n parts, forward legs only)`, "Senders pay in instalments. Each part records where it came from (the sender's account, as provenance) and which partner endpoint it landed in — which must be active, belong to the leg's partner vehicle and match the leg's collection method — and a user verifies it. Return legs and second legs have no collection: their money is already inside the system."],
      [`${c("DEAL")} or ${c("BALANCE_CONVERSION")} → ${c("CONVERSION")} (one owner)`, "A conversion belongs to exactly one of the two, never both. It is the single moment NPL's margin is captured and the money changes from client-owned to company-owned — the ledger (Diagram 4) hangs off it."],
      [`${c("DEAL_GROUP")} → ${c("DEAL")} (receiver group inherited)`, "The entitled group is set on the first forward leg; a second leg and a return leg inherit it. That is why a refund never moves money between pots."],
      [`${c("BALANCE_CONVERSION")} → ${c("ENTITLEMENT_REATTRIBUTION")}`, "Flip 5,000 SGD of held balance into USDT to fund a payout: no sender, no collection. Finance requests, Management approves, and the reattribution writes down whose pot the flipped money belonged to."],
      [`${c("DEAL")} → ${c("REROUTE")} → ${c("OWN_WALLET")}`, "Plan B when a partner cannot take the volume: an approved route through NPL's own wallet to an alternate partner, time-boxed, optionally netting dues the alternate partner owes NPL."],
    ],
    story: `The client orders €10,000 to Spain (DEAL_GROUP). It is quoted as one leg through PT, with the pair, vehicle, fee version and rates stamped on (DEAL). The sender pays in two parts into PT-tour's USDT wallet endpoint (COLLECTION × 2), each verified. PT converts; NPL's margin is captured and the client's EUR now sits at PT (CONVERSION). The story continues in Diagram 3b. If the payout later bounces, the bounce funds a return leg on the same order, attributed to the same group, which converts the money back and pays the sender's return receiver.`,
    confusions: [
      "A balance conversion is not a deal: there is no order, sender or collection behind it. It is NPL exchanging money the client already holds.",
      "Legs carry copies of the order's client, sender and group on purpose — a leg must be priceable and attributable on its own.",
    ],
  },
  "3b": {
    about: `The second half of the money's story: paying out, and everything that can happen afterwards. It is the payout machine (a run and its slips) plus its complaints department (confirmations, shortfalls, bounces, fee arguments) and the commission counters that tick per deal.`,
    read: `Start at ${c("SETTLEMENT")}: one payment run, draining one partner's holding through one ${c("SETTLEMENT_RAIL")} under one ${c("SETTLEMENT_SENDING_ENTITY")}. It owns ${c("SETTLEMENT_LINE")}s — one envelope per destination, each pointing at an approved ${c("DESTINATION_APPROVAL")}, the paid ${c("RECEIVER")}, and the ${c("DEAL")} leg it settles. Then what happens to a slip: ${c("CONFIRMATION")} (received, in full or short), ${c("SHORTFALL")} (the missing part, topped up next time), ${c("SETTLEMENT_RETURN")} (the bank bounced it). ${c("BANK_FEE_EVENT")} is the fee true-up on a run. ${c("FEE_DECISION")}, ${c("MARKUP_SHARE_ACCRUAL")} and ${c("PARTNER_REBATE_ACCRUAL")} are the one-off rulings and the commission counters that hang off deals.`,
    lines: [
      [`${c("SETTLEMENT")} → ${c("SETTLEMENT_LINE")}`, "One run, many slips, whole units only; the cents below one unit stay in the client's balance until they add up."],
      [`${c("DEAL")} → ${c("SETTLEMENT_LINE")} (deal_id)`, "Each slip names the leg it settles. For a client counterparty the pot comes from the receiver's group; for a refund or transit receiver — which has no group — the pot is the group of the leg named here. This is what makes “whose pot did this payment reduce?” answerable for every slip (ERD D17)."],
      [`${c("RECEIVER")} → ${c("SETTLEMENT_LINE")} (paid receiver)`, "If a counterparty is paid from a leg attributed to a different group, that is an offset: Management approval and tighter aging. A refund or transit payout is never an offset."],
      [`${c("SETTLEMENT_LINE")} → ${c("SETTLEMENT_RETURN")} → ${c("DEAL")} (Diagram 3a)`, "The bridge between the two diagrams. A bounced slip's money is back at the partner minus bank fees; it either waits in balance or funds a return leg, and the story runs again in reverse."],
      [`${c("CONFIRMATION")} → ${c("SHORTFALL")} ← ${c("SETTLEMENT")} (topped up by)`, "A short confirmation opens a shortfall; a later run tops it up, funded from NPL's pool with Management approval."],
      [`${c("DEAL")} / ${c("BALANCE_CONVERSION")} / ${c("SETTLEMENT")} ⇢ ${c("FEE_DECISION")} (dashed)`, "A polymorphic link: the decision's subject can be any of the three. A one-off, approved markup, waiver or override — the standing rules stay in the fee structure."],
    ],
    story: `A run drains PT's EUR holding through “Ali's EU bank” under the name “PT Global Inc” (SETTLEMENT): three slips to three approved accounts, each naming its deal leg (SETTLEMENT_LINE). Two are confirmed in full (CONFIRMATION); one arrives €50 short because the bank took a fee — a SHORTFALL opens and the next run tops it up. A fourth slip bounces (SETTLEMENT_RETURN): the money is back at PT minus €15, the bounce fee is booked (BANK_FEE_EVENT), and the bounce funds a return leg back in Diagram 3a. Meanwhile the markup-share party's commission and the rebate Jeton owes accrue on each deal.`,
    confusions: [
      "A shortfall is money the receiver is still owed; a return is money that came back. Different records, different fixes.",
      "An offset is not a ledger event — the postings are ordinary; what changes is the entitlement view.",
    ],
  },
  "4": {
    about: `The notebook at the back of the shop where every coin that moves is written down — plus the grown-ups who are allowed to write in it. Every money movement from Diagrams 3a and 3b arrives here as one balanced transaction; every balance anyone sees anywhere is a sum over these lines.`,
    read: `Three boxes carry the money. ${c("LEDGER_ACCOUNT")} is a jar with a four-word label — ${c("OWNER.HOLDER.CURRENCY.PURPOSE")}: whose money (CL = the client's, CO = the company's), where it is (a partner, NPL's own wallet, the project), the currency, and what it is for (collected, due, in transit, held, payable, pool…). ${c("LEDGER_TRANSACTION")} is one move, stapled to the event that caused it (the grey boxes along the top: a collection, a conversion, a settlement…). ${c("LEDGER_POSTING")} is one scribble in that move — a debit or credit on one jar — tagged with whose money it is and what kind of cost it is. The four boxes on the right are the controls: ${c("USER")}, ${c("APPROVAL")}, ${c("AUDIT_LOG")}, ${c("RECORD_LOCK")}.`,
    lines: [
      [`The grey boxes ⇢ ${c("LEDGER_TRANSACTION")} (dashed)`, "Every transaction has a receipt: source_type and source_id say which collection, conversion, settlement, return, confirmation, fee event, reroute, referral or rebate caused it. Nothing is ever written “just because”."],
      [`${c("LEDGER_TRANSACTION")} → ${c("LEDGER_POSTING")} → ${c("LEDGER_ACCOUNT")}`, "Money never appears or vanishes; it only moves from jar to jar, so a move is at least two scribbles that cancel — and they cancel per currency, because you cannot add apples to oranges. A conversion has a USDT half and a EUR half that each balance on their own."],
      [`${c("LEDGER_TRANSACTION")} → itself (reversal_of_id)`, "Written in pen, never erased. A mistake is fixed by a new transaction that says “this undoes that one”; both stay visible forever."],
      [`${c("PARTNER_CONFIG")}, ${c("OWN_WALLET")}, ${c("RECEIVER")}, ${c("SENDER")}, ${c("MARKUP_SHARE_PARTY")} ⇢ ${c("LEDGER_ACCOUNT")} (holder)`, "A jar's holder is whoever actually holds the money; a settlement rail or a narrative never does, so neither is ever a holder."],
      [`${c("USER")} → ${c("LEDGER_TRANSACTION")}, ${c("APPROVAL")}, ${c("AUDIT_LOG")}`, "Who posted it, who asked and who approved (never the same person), and who changed which field when."],
    ],
    story: `A sender pays 1,000 USDT. (1) It arrives: +1,000 in the client's “USDT at PT, collected” jar and +1,000 in “we owe the client's receivers USDT” — the two shelves (where it is / who we owe) agree. (2) PT converts it: the USDT half takes 1,000 off both USDT jars; the EUR half puts, say, 890 into the client's EUR jars and 10 into NPL's pool — the only moment any money changes colour from client to company. (3) PT pays the receiver: −890 from the client's EUR-at-PT jar and −890 from the EUR payable; both shelves are back to zero. (4) It bounces: +885 back into the client's EUR jars, and the €5 bank fee lands in whichever expense jar the fee decision says. At no point did anyone “edit a balance”; every number on the shelf is the sum of its scribbles.`,
    confusions: [
      "Almost none of the money in the system belongs to NPL. Most jars are CL jars; money changes to CO at exactly one event — margin recognition at conversion. NPL never advances money to a receiver.",
      "Client money is written on two mirrored shelves — assets that say where it is, liabilities that say to whom it is owed — and they must always add up to the same number per currency. Group entitlement is a view on the payable, not a jar.",
      "The dashed boxes (PROJECT_BALANCE, GROUP_ENTITLEMENT, OFFSET, CUSTODY) are calculators, not tables: counted again every time you ask, so they can never disagree with the notebook.",
    ],
  },
};

// ------------------------------------------------------------------ render diagrams (same as the ERD document)
console.log("rendering diagrams …");
const svgs = renderSvgs(DIAGRAMS.map((dg) => ({ id: dg.id, text: erDiagram(dg.nodes, { direction: "TB", noSelf: dg.noSelf }), config: {} })), path.join(outDir, ".mermaid-work"));
const diagramPage = (dg) => {
  const svg = svgs[dg.id];
  const m = /data-w="(\d+)" data-h="(\d+)"/.exec(svg);
  const land = m ? +m[1] / +m[2] >= 1.15 : true;
  return `<section class="diagram-page ${land ? "land" : "port"}">
<p class="dgnote"><b>Diagram ${esc(dg.id)}.</b> ${stubNote(dg.nodes, homeOf)}</p>
<figure>${svg}<figcaption>Diagram ${esc(dg.id)} — ${esc(dg.title)} (as in the ERD, Draft v${D.version})</figcaption></figure>
</section>`;
};

const boxTable = (dg) => {
  const full = dg.nodes.filter((n) => !n.startsWith("~"));
  return `<table class="boxes"><thead><tr><th style="width:28%">Box</th><th style="width:32%">What it is</th><th>Why it is there</th></tr></thead><tbody>
${full.map((n) => `<tr><td class="mono">${esc(n)}</td><td>${esc(ROLE[n] || D.E[n].desc.split(/[.;]/)[0])}</td><td>${esc(WHY[n])}</td></tr>`).join("\n")}
</tbody></table>`;
};
const chapter = (dg, i) => {
  const ch = CH[dg.id];
  return `${diagramPage(dg)}
<h2>${i + 1} · Diagram ${esc(dg.id)} — ${esc(dg.title)}</h2>
<h3>What it is about</h3><p>${ch.about}</p>
<h3>How to read it</h3><p>${ch.read}</p>
<h3>The boxes, one by one</h3>${boxTable(dg)}
<h3>The lines that matter</h3>
<table><thead><tr><th style="width:34%">Line</th><th>What it means</th></tr></thead><tbody>${ch.lines.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join("")}</tbody></table>
<h3>One story through the diagram</h3><p>${ch.story}</p>
<h3>Easy to get wrong</h3><ul>${ch.confusions.map((x) => `<li>${x}</li>`).join("")}</ul>`;
};

const views = Object.keys(D.E).filter((n) => D.E[n].d === "view");

// ------------------------------------------------------------------ HTML
const RUN = `NPLify · Reading the ERD · a guide to the six diagrams · v${GUIDE_V}`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(RUN)}</title>
<style>
@page { size: A4; margin: 16mm 18mm 16mm 18mm; @top-left { content: "${RUN}"; font: 8pt Helvetica, Arial, sans-serif; color: #666 } @bottom-right { content: counter(page); font: 8pt Georgia, serif; color: #666 } }
@page land { size: A4 landscape; margin: 12mm 12mm 10mm 12mm; }
html,body{margin:0;padding:0} body{font:10.5pt/1.5 Georgia,"Times New Roman",serif;color:#111}
h1{font:700 17pt Helvetica,Arial,sans-serif;color:#2f5d9e;text-align:center;margin:0 0 4pt}
h2{font:700 13pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:18pt 0 6pt;break-after:avoid}
h3{font:700 11pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:14pt 0 4pt;break-after:avoid}
p{margin:0 0 8pt} ul{margin:0 0 8pt 16pt;padding:0} li{margin:0 0 4pt}
code{font:8.8pt Menlo,Consolas,monospace} .mono{font:8.6pt Menlo,Consolas,monospace}
table{border-collapse:collapse;width:100%;margin:4pt 0 10pt;font-size:9.4pt}
th{text-align:left;font-weight:600;border-bottom:1px solid #333;padding:3pt 5pt} td{padding:3pt 5pt;border-bottom:1px solid #ddd;vertical-align:top} tr{break-inside:avoid}
.title{text-align:center;margin-top:40mm} .title .sub{font:700 13pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:0 0 10pt} .title .org{margin:0 0 2pt} .title .date{margin:0 0 16pt}
.rule{border-top:2px solid #222;border-bottom:1px solid #222;height:2px;margin:10pt 0 14pt} .pb{break-before:page}
.box{border:1px solid #2f5d9e;background:#f3f6fb;padding:6pt 9pt;margin:8pt 0;font-size:9.8pt}
.diagram-page{break-before:page;break-after:page;display:flex;flex-direction:column} .diagram-page.land{page:land;height:185mm} .diagram-page.port{height:262mm}
.diagram-page .dgnote{font-size:9.2pt;margin:0 0 3mm;flex:0 0 auto} .diagram-page figure{margin:0;flex:1;min-height:0;display:flex;flex-direction:column}
.diagram-page figure svg{flex:1;min-height:0;width:100%;height:100%} .diagram-page figcaption{font:italic 10pt Georgia,serif;text-align:center;margin-top:2mm;flex:0 0 auto}
.legend td:first-child{white-space:nowrap} .small{font-size:9pt;color:#444}
</style></head><body>

<div class="title">
<h1>NPLify · P0 Technical Baseline</h1>
<p class="sub">Reading the ERD — a guide to the six diagrams · v${GUIDE_V}</p>
<p class="org">New XP Technologies Limited</p>
<p class="date">${DATE} · Companion to the ERD &amp; Data Model, Draft v${D.version}</p>
</div>

<h2 class="pb">Before you start</h2>
<p><b>What this is.</b> The ERD (Deliverable 1) is the precise description of NPLify's data: ${Object.keys(D.E).length - views.length} tables and ${views.length} views across six diagrams. It is written for engineers. This guide walks the same six diagrams in plain language, one chapter each: what the diagram is about, how to read it, every box in one line, the lines that matter, one story walked through it, and the things people get wrong. The diagrams are reproduced from the ERD unchanged; the explanations are generated from the same model data, so the two cannot drift apart.</p>
<p><b>Who it is for.</b> Anyone at NPL or New XP who needs to understand how the system holds money and decisions without reading field lists — Operations, Finance, Management, and newcomers to the project.</p>

<h3>How to read any of the diagrams</h3>
<table class="legend"><tbody>
<tr><td><b>A box</b></td><td>One table in the database. The name on top; each row below is a field: its type, its name, and ${c("PK")} (the row's own id) or ${c("FK")} (the id of a row in another table — this is how tables point at each other).</td></tr>
<tr><td><b>A grey box with just a name</b></td><td>A table drawn in full in another diagram and shown here only because something connects to it. The note above each diagram says where it lives.</td></tr>
<tr><td><b>A line</b></td><td>A relationship. The end with the crow's foot (three prongs) is the “many” side — the table that stores the other table's id. Read it as a sentence using the label on the line: “DEAL_GROUP has many DEALs (legs)”.</td></tr>
<tr><td><b>Solid vs dashed</b></td><td>Solid (${c("||--o{")}): the parent owns the child — create and delete go together. Dashed (${c("||..o{")}): a reference, or a link that can point at several kinds of thing (a type column plus an id).</td></tr>
<tr><td><b>Dashed boxes with no fields</b></td><td>Derived views — figures computed from the tables every time you ask (client balance, group entitlement, offsets, custody). Never stored.</td></tr>
</tbody></table>

<h3>The whole model on one page</h3>
<p>Four domains, read in the order things happen. <b>Configuration</b> (Diagrams 1a and 1b) is set up once per client: who the client is, who may send and receive, and how each partner is used. <b>Rates</b> (Diagram 2) arrive every day: market snapshots and partner offers, versioned and never edited. <b>Deal lifecycle</b> (Diagrams 3a and 3b) is where money moves: an order, its legs, money in, the exchange, money out, and everything that can go wrong afterwards. <b>Ledger &amp; controls</b> (Diagram 4) is where every movement is written down, and who is allowed to do what.</p>
<div class="box"><b>Five ideas that carry everything.</b> (1) A <i>project</i> is a client; everything hangs off it. (2) Receivers live in <i>groups</i> — pots of entitlement; most projects have one. (3) A <i>deal group</i> is the order; a <i>deal</i> is one leg of it, with its prices frozen at quote. (4) A <i>conversion</i> is the one moment money changes from the client's to NPL's. (5) The <i>ledger</i> is written in pen: every balance is a sum over postings, nothing is ever edited.</div>

${DIAGRAMS.map(chapter).join("\n")}

<h2 class="pb">7 · One deal, all six diagrams</h2>
<p>Sender A, a sender of Client 1, wants to pay Receiver Y €2,000-worth of USDT.</p>
<ol>
<li><b>Configuration (1a, 1b).</b> Sender A is a SENDER allowed to pay the default group; Receiver Y is a counterparty RECEIVER in it, with VoiceAIWrapper as his entity and a EUR account over SWIFT. Ali's block for this client says: USDT → EUR, disclosed-rate pricing, NPL fee 1.00 % (0.40 / 0.60), vehicles PT-tour and PT Global with USDT wallets, payouts through “Ali's EU bank” under “PT Global Inc”, and Receiver Y’s account approved by Ali.</li>
<li><b>Rates (2).</b> Ops quotes: a Kraken snapshot is taken, today's PT × USDT-EUR comparison is created or reused, PT's offered rate is recorded as a version and checked for a breach; the deal stamps both.</li>
<li><b>Deal, money in (3a).</b> One DEAL_GROUP, one forward DEAL leg with the receipt stapled on. Sender A pays into PT-tour's USDT wallet endpoint — the endpoint is active, belongs to the vehicle on the leg and is a wallet because the leg collects crypto — and Ops verifies the COLLECTION. PT converts; NPL's 0.60 % receiver fee and margin are captured in the CONVERSION.</li>
<li><b>Money out (3b).</b> A SETTLEMENT drains PT's EUR through the rail under the narrative; one SETTLEMENT_LINE to Receiver Y’s registered account, naming the leg it settles. Receiver Y’s bank confirms in full (CONFIRMATION); the expected 25 EUR bank fee is trued up (BANK_FEE_EVENT).</li>
<li><b>Ledger (4).</b> Four balanced transactions were written along the way — collection, conversion, settlement, confirmation — each stapled to its source, each line tagged client or company and principal, earnings or bank fee. Finance's daily identity holds: client money at partners equals what is owed to the client's receivers, and the default group's entitlement equals the client balance.</li>
</ol>
<p class="small"><i>Guide v${GUIDE_V} — companion to ERD Draft v${D.version}. Names, amounts and rates in the stories are illustrative.</i></p>
</body></html>`;

fs.mkdirSync(outDir, { recursive: true });
const htmlPath = path.join(outDir, `NPLify-ERD-Reading-Guide-v${GUIDE_V}.html`), pdfPath = path.join(outDir, `NPLify-ERD-Reading-Guide-v${GUIDE_V}.pdf`);
fs.writeFileSync(htmlPath, html);
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${pdfPath}`, "file://" + htmlPath], { stdio: "ignore" });
fs.rmSync(path.join(outDir, ".mermaid-work"), { recursive: true, force: true });
console.log("wrote", pdfPath, `(${(fs.statSync(pdfPath).size / 1024).toFixed(0)} KB)`);

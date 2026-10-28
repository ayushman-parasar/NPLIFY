// Build docs/NPLify-Operating-Procedures-v5.9.{html,pdf}: standard operating procedures, one per project, for
// NPL's Operations, Finance and Management — written from the scenario catalogue, NPL's project context and
// payment-method steps, the fee table, the shared flows and the controlled-actions list, against the model at
// data/erd.v5.json. Part A is the common procedures every project refers to; Part B is one SOP per project.
//                                                                             node scripts/build-sop-doc.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ACTIONS } from "./controlled-actions.mjs";
import { clientFacing } from "./client-facing.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const D = JSON.parse(fs.readFileSync(path.join(root, "data/erd.v5.json"), "utf8"));
const outDir = path.join(root, "docs");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const V = D.version, DATE = "28 October 2026";
const FLOWS = Object.fromEntries(D.SCENARIO_CATALOGUE.flows.map((f) => [f[0], f[1]]));

// ------------------------------------------------------------------ Part A · common procedures (C1–C10 mirror the shared flows F1–F10)
// [code, name, when it applies, steps [who, does], evidence / record]
const COMMON = [
  ["C1", "Cash by token — collection or payout", "Any cash leg: INR, THB, JPY, AED or USD cash, in a named city. The same steps serve a collection and a payout with the roles switched.", [
    ["Operations", "Takes the city from the sender (or receiver) first: the partner's rate and its agent depend on it. Shares the partner's rate for that city with the party; on a bank-side pair this happens before the partner's 14:30 cutoff."],
    ["Operations", "On the party's confirmation, asks the partner for the token (a local-currency bill whose serial number identifies the agent) and the agent's contact, and records both on the collection or the payout line."],
    ["Operations", "Passes the token serial and the contact to the sender (collection) or relays the receiver's token to the partner and the agent (payout). If the partner replaces the agent or the token before the meeting, passes the new details on; the rate locked at quote does not change."],
    ["Sender / receiver and agent", "Meet; the agent shows the token; cash is handed over; the party keeps the token (collection) or the agent photographs it (payout)."],
    ["Operations", "Attaches the photo of the token as evidence; shares it with the partner to close the loop."],
    ["Partner", "Counts and confirms the amount. A count that is short is recorded as a shortfall (collection: the deal continues on the counted amount; payout: topped up at the next payout or paid separately)."],
    ["Operations", "Marks the part counted and verifies it (collection) or marks the line confirmed (payout). The collected cash amount is rounded as the pair says (INR, THB, JPY to the thousand; AED cash to 100; USD cash in Dubai to 10)."],
  ], "Token serial, agent contact, the token photo, counted amount and time; the city on the deal."],
  ["C2", "USDT collection with wallet screening", "Every USDT collection on every project. Sender wallets are screened before any address is given out, except where the project allows a sender to skip it (some Evo senders).", [
    ["Operations", "Asks the sender to declare the sending wallet (network and address)."],
    ["Operations", "Screens the wallet with the screening tool and records result, decision and evidence. A report that is clear under the provider's strict rulebook (nothing at threshold, no terrorism-financing trace, score in the clear band) is Operations' decision: accept, the partner's standard receiving wallet. Anything else goes to Management's second look, which decides accept, accept on the partner's alternate (elevated-band) wallet, or reject, with the reason, the report and the decision kept together; the approver is never the person who screened. A reject stands: it is lifted only by a new screening of the same address decided by Management, and nobody at NPL, Finance included, overrides it. A hold, freeze or decline by the partner or its bank is the partner's decision: NPL records it as the event it is, routes around it and records the partner's clearance reference when the partner lifts it (Roles &amp; Visibility rule 11; Configuration Schema 4)."],
    ["Operations", "Gives the sender the receiving address. If the partner lacks the sender's network (Ali has no ERC-20), gives NPL's own bridge wallet on that network; the funds are forwarded to the partner on a supported network as a hop, within the wallet's custody limit."],
    ["Sender", "Sends the transfer and shares the transaction hash."],
    ["Operations", "Checks the hash on Tronscan (TRC-20) or Etherscan (ERC-20): address, amount, confirmations. Attaches the result as evidence and shares the hash with the partner."],
    ["Partner", "Confirms the funds are received."],
    ["Operations", "Verifies the collection part. An overpayment becomes a sender credit; an underpayment leaves the deal in Collecting until Finance decides to wait or void."],
  ], "Screening record; sending address; hash and explorer result; the partner's confirmation."],
  ["C3", "Receiver wallet screened before a USDT payout", "Every payout to a wallet: BF withdrawals, Peru, NPL-GR vendor payments, JTN and Jonas payouts in USDT, AK Personal withdrawals in USDT.", [
    ["Operations", "Takes the receiver's wallet (network, address); screens it and records the report, the decision and the evidence on the account's destination approval, under the same rule as C2: a clear report is Operations' decision, anything else is Management's second look, a reject is never overridden."],
    ["Operations", "Prepares the payout line to that account; Finance approves the payout (Section A.5)."],
    ["Partner", "Executes the transfer and provides the hash."],
    ["Operations", "Shares the hash with the receiver; attaches it to the line."],
    ["Receiver", "Confirms receipt; Operations marks the line confirmed."],
  ], "Screening record on the destination; the hash; the receiver's confirmation."],
  ["C4", "Bank transfer in (SWIFT; SEPA when offered)", "Collections by bank transfer: Evo's other currencies, BF withdrawals (at Jeton), Peru, YN Remit and 66 Group where the sender pays by bank.", [
    ["Operations", "Collects the sender's bank account and company profile (name, address, nature of business) and any KYC the partner asks for; asks the partner for a receiving account."],
    ["Partner", "Approves the sender and provides the receiving account (its own vehicle's account, with the rail)."],
    ["Operations", "Activates the endpoint in the app once the rail is known; shares the details with the sender."],
    ["Sender", "Executes the transfer and shares the proof."],
    ["Operations", "Attaches the proof and shares it with the partner."],
    ["Partner", "Confirms the incoming transfer."],
    ["Operations", "Verifies the collection; the conversion follows the flow agreed with the sender before the transfer (Section A.4)."],
  ], "Sender profile and KYC references; the receiving account; proof of transfer; the partner's confirmation."],
  ["C5", "Bank transfer out (SWIFT; SEPA when offered)", "Payouts by bank transfer on every project that pays a bank account.", [
    ["Operations", "Before any collection: records the receiver's bank details and company profile (KYC if needed) and asks the partner to approve the destination and name the route. A quote-first deal cannot leave Inquiry until the destination is approved with the chosen partner."],
    ["Operations", "After the collection is verified and converted: prepares the payout (amount, destination, narrative — the partner's vehicle, the customer's own entity or NPL's entity as the project says)."],
    ["Finance", "Approves the payout (Management also, above the settlement limit or for a third same-day slot). On a partner with a bank cutoff, a payout approved after the cutoff goes out on the next business day."],
    ["Partner", "Releases the transfer and shares the slip."],
    ["Operations", "Shares the slip with the receiver; attaches it to the line."],
    ["Receiver", "Confirms receipt; Operations marks the line confirmed. A request to cover the bank fee is a special case: Finance reviews and recommends, Management approves."],
    ["Operations", "If the transfer is not received: asks the partner to inquire through the banking channel (PT Sukses, PT Global); records the enquiry on the line until it is resolved."],
  ], "Destination approval; the narrative; the slip; the receiver's confirmation; any bank-fee decision."],
  ["C6", "Returned transfer", "A bank rejects the payout and the money comes back to the partner, usually less a fee.", [
    ["Operations", "Records the return on the line: amount returned, bank fee kept, reason. The line's outcome becomes returned and the money is back in the client's balance at that partner."],
    ["Finance", "Decides with the client: resend to the same destination, use the returned funds for another payout in the same group, or reconvert and return to the sender. A return to the sender is a return leg to the sender's own return account; any other destination needs Management approval with a reason."],
    ["Operations", "Prepares the chosen payout; the bank fee is treated as the project says (waived, carried forward or absorbed) or by a one-off decision."],
  ], "Return record with amount, fee and reason; the follow-up payout."],
  ["C7", "One-time local deposit account", "Local-currency collections where the partner arranges an account for one transaction and one amount (INR for 66 Group, local deposits generally).", [
    ["Operations", "Asks the partner for the account for this deal; records it as a single-use endpoint reserved for the deal with the expected amount."],
    ["Operations", "Shares name, account number, bank and the exact amount with the sender."],
    ["Sender", "Deposits at a branch or transfers locally; shares the proof."],
    ["Operations", "Attaches the proof; shares it with the partner."],
    ["Partner", "Confirms the funds are recognised; Operations verifies the collection."],
    ["Operations / Finance / Management", "If the account is frozen: the partner asks the sender to confirm its own account is functional. Funds lost because of the sender's side are a loss event — Operations records it, Finance proposes the split, Management approves — and the collection is reversed only if Management unwinds the deal."],
  ], "Single-use endpoint with its deal and amount; proof of deposit; the partner's confirmation; any loss event."],
  ["C8", "Local payout for a small amount", "Where the partner allows it (Singapore, Hong Kong, Indonesia, Thailand): the receiver gives a local account; the partner pays by cash deposit or local transfer.", [
    ["Operations", "Confirms with the partner that the country and amount qualify; records the receiver's local account (single-use if given for this payout only)."],
    ["Operations", "Prepares the payout; Finance approves."],
    ["Partner", "Pays by cash deposit into the account or by local transfer and shares the proof. A deposit by the agent into the receiver's bank account is a local bank payment, not a cash hand-over: no token."],
    ["Receiver", "Confirms receipt; Operations marks the line confirmed. Cash short is adjusted at the next payout or paid separately."],
  ], "Local account; proof of payment; the receiver's confirmation."],
  ["C9", "Bank cutoff (Ali and the other Asian partners)", "Pairs that depend on the banking channel: conversions into EUR and other bank currencies at Ali, USD and SGD balances at Ali. Jeton and Aquanow have no cutoff.", [
    ["Finance", "In the morning: takes the partner's rate for the day, compares it with the market and confirms the rate version (a breach freezes the pair until Finance decides)."],
    ["Operations", "Quotes and locks the rate with the partner before 14:30 Hong Kong time; a deal locked before the cutoff converts the same day."],
    ["Operations", "After the cutoff: the collection goes ahead on the morning's figures; the app stamps the conversion due date as the next business day (weekends and the partner's holidays skipped); the converted value shows as pending in the balance."],
    ["Finance", "Next business day: if the partner's rate still holds the minimum margin, the conversion runs at that day's rate and NPL absorbs the difference; if not, asks the partner for a better rate or defers another day, with the reason recorded."],
    ["Operations", "Payouts by bank on such a partner approved after the cutoff go out on the next business day. For an urgent request the partner may extend the cutoff by 30–60 minutes; Finance records the extension with the partner's agreement. On a Friday or before a holiday the partner may close an hour early."],
  ], "Rate version of the day; lock time, cutoff time and due date on the deal; any cutoff override."],
  ["C10", "Internal transfer inside the partner's platform", "Aquanow moves EUR to BF's account on the same platform (and to Raeen's own Aquanow account for sub-account deals).", [
    ["Operations", "Prepares the payout to the account whose rail is internal; Finance approves."],
    ["Partner", "Moves the funds; BF recognises them at once; no bank fee."],
    ["Operations", "Marks the line confirmed on the receiver's confirmation (often the same day)."],
  ], "The internal transfer reference; the receiver's confirmation."],
  ["C11", "Email OTP — the customer's approval of the order", "Any quote-first deal on a project with Email OTP switched on. The customer approves the exact order by a one-time code sent by email and pasted in the sender's registered chat group; the code is the acceptance (Lifecycle & Approvals 2e). A sender whose approver address and chat group are not entered and approved cannot be quoted while the switch is on; the screen says why.", [
    ["Operations", "Prepares the quote as usual (Finance approves it where the thresholds require) and presses Send for customer approval. One email leaves for the sender's registered approver address: the quote as rendered, a one-time code with its expiry, and the first and last four characters of the collection destination. No link, never the full account or wallet."],
    ["Customer", "Pastes the code in the sender's registered chat group; at or above the step-up amount, the order amount as well. A reply to the email, or a message in the group, with 'reject' and the reason is a rejection."],
    ["Operations", "Enters the code (and the amount where required). The server validates it: right code, right issue, unexpired, unused; five wrong attempts lock it and a locked, expired or voided code needs a new send. Attaches a screenshot of the customer's message as evidence. The group is customer approved."],
    ["Operations", "Sends the full destination in the registered chat group; the customer's standing rule is to pay only if it matches the partial identifier in the email. The collection then follows C2, C4 or C7 as usual."],
    ["Operations", "If nothing arrives from the registered group within the tripwire window (default 4 hours), verifies with the customer through a known contact outside the chat. A code whose chat evidence cannot be produced from the registered group blocks collection and opens an exception."],
    ["Operations · Finance", "A change of a sender's approver address or chat group is a settings change: Operations enters, Finance approves (never the same person); the new address is active only after its verification code comes back through that sender's group; that sender's open codes are voided."],
  ], "The email snapshot, the code reference, the chat screenshot, the approval stamp (user and time); a rejection with its reason verbatim."],
];

// ------------------------------------------------------------------ Part A · the day: standing procedures
const STANDING = [
  ["A.1", "Rates of the day", [
    "Finance takes each partner's rate for the pairs in use (Ali in the morning for bank-side pairs; Jeton and Aquanow when quoting) and enters it as quoted, with its direction; the app normalises it and compares it with the market feed (Kraken, then CoinMarketCap).",
    "A version whose spread breaches the project's threshold freezes quoting and conversion on that partner × pair until Finance approves it with a reason, rejects it, or asks the partner for a better rate (a new version). A version outside the absolute tolerance in either direction, better or worse than the market, is flagged: it prices nothing and instructs nothing until Finance confirms it with a reason or rejects it, while the last usable version keeps serving; a quote or conversion attempted against a flagged version is refused and the refusal logged (Calculation Specification 2a). Operations sees only usable, flagged or frozen.",
    "With both market feeds down, Finance enters a manual rate with evidence; nothing prices until a rate exists.",
  ]],
  ["A.2", "Quoting", [
    "Operations picks the sender, the receiver group, the partner × pair and the amount mode (fixed amount in, or target amount out). The app applies the fee structure in force (and any sender override or tier), prices on the market rate or the partner's rate as the structure says, and produces the sender-facing figures.",
    "A quote below the minimum margin needs Finance approval before it is sent. The quote package is rendered from the project's template and sent; the package is kept with the figures it printed.",
    "Validity runs per the project (freshness, validity, grace). Before validity ends Operations may request an extension, approved by Finance, any number of times. After validity: the grace rule applies; beyond it the sender gets a new deal. Honouring an expired rate on a new deal is a Finance approval.",
    "Collect-first senders have no quote: the deal is created when the money arrives and priced at conversion.",
  ]],
  ["A.3", "Collecting", [
    "By the common procedure the method calls for: C2 (USDT), C4 (bank), C1 (cash), C7 (one-time local account). Every part is verified by Operations with its evidence; the deal moves to Collected when the full amount (or the agreed partial) is verified.",
    "The collection must land on an endpoint of the partner entity stamped on the deal, of the kind the leg's method requires. The app refuses anything else.",
    "On a project with Email OTP switched on, no collection is recorded until the customer's code has been validated for the current quote issue (C11); a sender whose approver address and chat group are not entered and approved cannot be quoted at all, and the screen says why.",
  ]],
  ["A.4", "Converting", [
    "Operations instructs the conversion once the deal is Collected (on a bank-side pair, not before the conversion due date). Finance approves. The receiver's fee part is taken at conversion; the sender's part was taken in the price.",
    "The partner's actual conversion is recorded; a difference from the expected figure beyond the project's tolerance opens a variance exception that Finance resolves (Management above the project's limit). The deal does not wait for it.",
    "Finance may keep NPL's margin unconverted in the collection currency (and later offset it between partners); otherwise the margin converts with the client's money and rests at the partner.",
  ]],
  ["A.5", "Paying out (settlement)", [
    "Operations prepares the settlement: lines to approved destinations, within the group's entitlement, rounded as the pair says (bank transfers carry cents; cash rounds to the unit). The narrative is the one configured for the route.",
    "Finance approves; Management also above the settlement limit, for a third same-day slot, or when a counterparty receiver is paid from another group's money (an offset). With only one Finance user on shift, Management countersigns.",
    "Release by the partner discharges the promise; the receiver's confirmation closes the line; a short delivery opens a shortfall; a return re-raises the promise (C6).",
  ]],
  ["A.6", "End of day", [
    "Finance reconciles: balances per partner × currency against the partner's view, open deals and their states, the day's margin, the exception list (variance exceptions, frozen pairs, open offsets, custody aging, pending conversions, unconfirmed payouts, open loss recoveries, unconfirmed journal rows).",
    "Operations clears what it owns on the exception list; anything that needs a decision is escalated to Finance before the next day's first deal.",
  ]],
  ["A.7", "Month end", [
    "Finance reconciles the rebate accruals against each partner's statement (Jeton 0.4 % of the amount, 0.3 % on Novi; Aquanow 0.3 %) — only NPLify's own deals, never the partner's whole statement — and the markup-share accruals against each party's working (Raeen); records what was received; settles what NPL owes.",
    "Finance reviews earnings resting at partners and proposes offsets between partners (Management approves) or leaves them for the partner's fee cycle.",
    "Finance checks the month's tier volumes (GDC) and the exposure ceilings (AK Personal, any held balance).",
  ]],
  ["A.8", "Exceptions that have their own procedure", [
    "Reroute (partner unavailable after quote): Operations requests, Finance approves, Management if the contingency route is used; client money in NPL's own wallet is reported daily until it moves on.",
    "Void: before money moved, Finance approves; after collection (refund, credit or hold), Management approves.",
    "Loss event (frozen account, cash short and unrecoverable, wrong-chain transfer): Operations records it the same day; the whole loss is booked to NPL and the client made whole; Finance proposes the split with the partner, the sender and the client; Management approves; each share is recovered and recorded separately.",
    "Shortfall: topped up at the next payout, or by its own payout; a top-up from NPL's pool is a Management approval.",
    "Balance conversion (a held balance into another currency): Finance requests, Management approves; on a bank-side pair the cutoff applies.",
    "A leg on hold (a partner's hold, freeze or decline, or NPL's own screening awaiting Management's second look): the leg keeps its state and the server refuses every movement of the money — conversion, balance conversion, settlement line, refund, reroute forward, return — for every role; recording, screening, evidence, partner messages and a void before money moved stay allowed. A partner hold ends only when Finance records the partner's clearance with its reference; a screening hold only with Management's second look or a new clear screening. The one movement under hold is the one the partner instructs in writing, recorded with its reference and approved by Management, never while the partner's hold is on the balance itself. A partner hold is chased daily from the exception list (Lifecycle &amp; Approvals 2c).",
    "An instruction with outcome unknown (the partner has not acknowledged a conversion, settlement line or reroute forward by the time-out): Operations raises the partner reference inquiry the same day and records the answer with its evidence; Finance obtains the partner's statement; nothing is sent again by anyone meanwhile. Executed: the instruction is marked against the partner's reference and the line continues. Not received: Management closes it as rejected on the partner's written confirmation and Finance authorises the one retry under a new partner reference, recorded as a retry of the held line. Escalated to Management if the partner has not answered by its next statement or within two business days (Lifecycle &amp; Approvals 2d and 8a).",
    "Bank account details (a receiving account, a partner's bank endpoint, a settlement rail, a sender's bank source): Operations enters them in full from the bank's letter or confirmation, with the document as evidence; Finance or Management approves, never the person who entered them; the row becomes active and the account, endpoint or rail that points at it may become active. The details are read in full by all three roles and every full read is logged (Roles &amp; Visibility rule 10).",
    "A dormant route (a partner pair in status dormant): it prices nothing and accepts no collection or settlement line. Before it is used again Finance runs the reactivation checklist — the partner's current confirmation of the product, the destination approvals, the rates of the day, the fee structure validated against the current agreement, the test cases of the Test Strategy run on staging — and Management sets the pair active. A route unused for the project's route_unused_days threshold is put on the quarterly review to be set dormant or kept (Scenario Catalogue; Configuration Schema, partner pair).",
    "The opening date (opening entries, in-flight deals, suspense lines): the procedure is Section 4 of the Cutover Approach and is not repeated here.",
  ]],
];

// ------------------------------------------------------------------ Part B · one SOP per project
// glance: [label, value]; setup: checklist before the first deal; steps: [step, who, does, control]; rules; checks
const PROJECTS = [
  {
    id: "bf", name: "BF — Betfair customers funding their accounts", client: "Betfair (BF)",
    purpose: "Betfair's customers send USDT; NPL converts it to EUR and the EUR reaches Betfair's receiving account (Sporting Exchange). Aquanow is used for everything today because the EUR reaches BF by internal transfer, instantly; Ali is the alternative (SWIFT, 1–2 days); Jeton is inactive.",
    glance: [
      ["Senders", "Seven, Arrow Wood, Trade Lab, Orbit, Blue Sapphire, Novi, Raeen (direct collections from its downlines)"],
      ["Receiver", "Betfair — the Sporting Exchange account (EUR); one receiver group"],
      ["Partners and pairs", "Aquanow (preferred) · Ali (alternative, via PT Sukses) · Jeton (inactive); USDT → EUR"],
      ["Entry mode", "Quote-first"],
      ["Fee via Aquanow", "0.8 % flat, stated on top of market; Aquanow pays NPL 0.3 % of the amount back monthly (NPL's only margin on the deal)"],
      ["Fee via Jeton", "1 % off market (Novi 0.9 %); Jeton keeps the fee and pays NPL 0.4 % of the amount back monthly (0.3 % on Novi)"],
      ["Fee via Ali", "Ali's cost (about 1 %) sits inside its rate; NPL adds 0.4 % (0.3 % for Novi); the customer's calculation shows 'fee 1 %' on a recomputed source rate"],
      ["Raeen direct", "Sender pays 1 %; Aquanow costs 0.8 %; the 0.2 % left is shared 75 / 25 (0.15 % Raeen, 0.05 % NPL); Aquanow's 0.3 % rebate is NPL's alone"],
      ["Payout", "C10 internal transfer (Aquanow) · C5 SWIFT under PT Sukses (Ali, subject to C9 cutoff on the EUR settlement)"],
      ["Rounding", "Bank transfers exact (cents)"],
    ],
    setup: ["Client Betfair with its three projects (BF, BF Sub, BF Withdrawal); this is BF.", "One receiver group; Betfair's receiving entity with the Sporting Exchange EUR account: rail internal at Aquanow, SWIFT at Ali; destination approved with each partner that may pay it.", "Every sender with an allow-list naming the group and a return account for refunds.", "Partner pairs USDT → EUR: Aquanow fee on market 0.8 % with rebate rule 0.3 % of amount; Ali fee in rate with the customer-facing fee fixed at 1 % (0.9 % for Novi); Jeton fee on market 1 % with rebate rule 0.4 % (sender override 0.9 % for Novi with rebate 0.3 %).", "Raeen direct: its own fee structure at 1 % with a markup-share rule (Raeen 75 % of the net markup, settled monthly by Raeen).", "Quote template with the sender-facing fields only."],
    steps: [
      ["1", "Operations", "Takes the sender's request (amount in USDT or target EUR) and declares the partner — Aquanow unless Finance says otherwise.", "—"],
      ["2", "Operations", "Quotes (A.2). Via Ali the quote shows 'fee 1 %' on the recomputed rate; via Aquanow 0.8 %; via Jeton 1 %. Sends the quote package.", "Finance approval if below the minimum margin"],
      ["3", "Operations", "Collects the USDT by C2 (screen the sender's wallet; give the partner's receiving wallet; verify the hash; partner confirms).", "Screening record; hash"],
      ["4", "Operations", "Instructs the conversion (A.4). Via Ali on a day the rate was locked after 14:30: the conversion runs the next business day (C9).", "Finance approval"],
      ["5", "Operations", "Prepares the payout to the Sporting Exchange account: C10 at Aquanow (instant, no fee) or C5 at Ali (SWIFT, 1–2 days, PT Sukses narrative).", "Finance approval; Management above the limit"],
      ["6", "Operations", "Marks the line confirmed on Betfair's confirmation; records any shortfall or return (C6).", "—"],
      ["7", "Finance", "Month end: reconciles Aquanow's 0.3 % (and Jeton's 0.4 % / 0.3 %) rebate statement against the accruals; settles Raeen's 75 % share on direct collections from Raeen's monthly working.", "A.7"],
    ],
    rules: ["Aquanow is the default route: lowest cost to the customer and instant recognition by BF. A deal goes via Ali only when Aquanow cannot serve it; Jeton is configured but inactive.", "On BF via Ali the customer sees 'fee 1 %' and a source rate recomputed so the calculation lands there; the true parts (Ali inside its rate, NPL 0.4 %) are Finance's view only. Ali sometimes quotes the pair the other way round (1.1738 for 0.851934): Operations enters the rate exactly as quoted with its direction; the app normalises it.", "Rebates are NPL's only margin on Aquanow and Jeton deals: they accrue with the conversion and are reconciled monthly; they are never shown to the sender and never shared.", "Raeen's direct collections carry a share rule: the 0.2 % between the 1 % charged and Aquanow's 0.8 % is split 75 / 25; the share accrues with the conversion and Raeen settles NPL's part monthly."],
    checks: ["Before release: destination approved with the paying partner; entitlement covers the line.", "Daily: Betfair's confirmation on every internal transfer; any Ali SWIFT not confirmed within two business days is chased (C5 step 7).", "Monthly: rebate accrual vs partner statement; Raeen share statement."],
  },
  {
    id: "bf-sub", name: "BF Sub — sub-accounts provided by Raeen", client: "Betfair (BF)",
    purpose: "Downlines fund a Betfair sub-account that Raeen provides, at a premium: the sender-facing rate is higher than the cost of the remittance, and NPL shares the markup with Raeen. Via Aquanow the EUR lands in Raeen's own Aquanow account; via Ali the SWIFT transfer goes to Betfair under Raeen's narrative.",
    glance: [
      ["Senders", "Raeen's downlines"],
      ["Receiver", "Betfair (via Ali, narrative Raeen) or Raeen's own Aquanow account (via Aquanow); Raeen allocates to the sub-account"],
      ["Partners and pairs", "Aquanow or Ali; USDT → EUR"],
      ["Entry mode", "Quote-first"],
      ["Fee", "4 % to the sender, fixed"],
      ["Share", "The 4 % less the partner's fee — 3.2 % via Aquanow (0.8 %), 3 % via Ali (about 1 %) — split equally with Raeen (1.6 % / 1.6 %, or 1.5 % / 1.5 %)"],
      ["Rebate", "Aquanow's 0.3 % is NPL's alone, outside the share and not visible to Raeen"],
      ["Settlement of the share", "Raeen holds the converted EUR, keeps its share and pays NPL's share monthly"],
      ["Payout", "C10 internal transfer (Aquanow) · C5 SWIFT (Ali)"],
    ],
    setup: ["Project BF Sub under client Betfair.", "Raeen's receiving entity and its Aquanow account (rail internal); Betfair's account for the Ali route; destinations approved.", "Fee structure 4 % fixed on both partner pairs; markup-share rule for Raeen: basis share of net markup, 50 %, party retains the funds, scoped to this fee structure; Aquanow rebate rule 0.3 %.", "Settlement sending entity 'Raeen' on the Ali route (the narrative Betfair sees)."],
    steps: [
      ["1", "Operations", "Quotes the downline at 4 %: the app deducts the markup from the amount sent, converts the rest at the partner's rate, and recomputes the customer-facing rate from the EUR that results (50,000 USDT via Aquanow: 48,500 converted at 0.856086 = EUR 41,520.71, shown to the sender as 50,000 × 0.8304).", "Finance approval if below the minimum margin"],
      ["2", "Operations", "Collects the USDT by C2.", "Screening record; hash"],
      ["3", "Operations", "Instructs the conversion (A.4). The share accrues with the conversion as a receivable from Raeen; the rebate accrues separately.", "Finance approval"],
      ["4", "Operations", "Pays out: C10 to Raeen's Aquanow account, or C5 to Betfair under the narrative Raeen. Raeen allocates the EUR to the sub-account.", "Finance approval"],
      ["5", "Finance", "Month end: Raeen's statement — Raeen keeps its half and pays NPL's half; Finance records the receipt against the share receivable. Aquanow's rebate reconciled separately (A.7).", "A.7"],
    ],
    rules: ["The sender never sees the partner's fee or the split: only the 4 % and the recomputed rate.", "The base of the share is the markup less the partner's fee; the rebate is never in it.", "More than one party with different shares may apply to future deals; each is a separate rule on the fee structure."],
    checks: ["Monthly: share receivable from Raeen cleared by its payment; the rebate accrual vs Aquanow's statement."],
  },
  {
    id: "bf-withdrawal", name: "BF Withdrawal — customers taking funds back", client: "Betfair (BF)",
    purpose: "A Betfair customer withdraws: Betfair wires the customer's balance (EUR or GBP) to the bank account Jeton provides; Jeton converts to USDT at 1 % over market and pays the customer's wallet. Jeton is the only partner that can receive these transfers.",
    glance: [
      ["Sender", "Betfair, on the customer's instruction (bank transfer to Jeton's SWIFT account)"],
      ["Receiver", "The customer's TRC-20 or ERC-20 wallet"],
      ["Partner and pairs", "Jeton only; EUR → USDT, GBP → USDT"],
      ["Entry mode", "Collect-first (the amount is known when Jeton receives it)"],
      ["Fee", "1 % over market (not fixed by contract; charged in recent transactions); Jeton pays NPL 0.4 % of the amount back monthly"],
      ["Collection", "C4 bank transfer in at Jeton; Betfair occasionally provides a slip"],
      ["Payout", "C3 receiver wallet screened, then USDT payout"],
    ],
    setup: ["Project BF Withdrawal under client Betfair.", "Jeton's bank endpoint with its rail (SWIFT); the customers' wallet accounts (network and address) with destination approval at Jeton and a screening on each.", "Partner pairs EUR → USDT and GBP → USDT, fee on market 1 %, rebate rule 0.4 %."],
    steps: [
      ["1", "Operations", "The customer asks Betfair to withdraw to Jeton's account; Operations records the expected collection (sender Betfair, the customer as receiver) and attaches Betfair's slip if provided.", "—"],
      ["2", "Operations", "On Jeton's notice that the wire arrived: verifies the collection (C4 steps 5–7).", "Jeton's confirmation"],
      ["3", "Operations", "Instructs the conversion to USDT at Jeton's rate (market + 1 %).", "Finance approval"],
      ["4", "Operations", "Screens the customer's wallet (C3), prepares the USDT payout, Finance approves, Jeton pays, hash shared, customer confirms.", "Finance approval; screening record"],
      ["5", "Finance", "Month end: Jeton's 0.4 % rebate reconciled (A.7).", "A.7"],
    ],
    rules: ["Ali and Aquanow cannot receive these transfers; the route is Jeton or nothing.", "Customers hold both TRC-20 and ERC-20 wallets: the payout goes to the network the customer names, and the screening is per address."],
    checks: ["Every incoming wire matched to a customer and a Betfair instruction before conversion; no conversion on an unidentified receipt."],
  },
  {
    id: "evo", name: "Evo — customers paying their invoices to Evo", client: "Evo",
    purpose: "Evo's customers pay Evo's invoices through NPL, almost always in USDT; everything converts into EUR and is paid to Evo's entities by SWIFT. Two receiver groups: Bplay (entities Babylon, paid on an invoice reference; Bplay and Lex, self-transfers with an internal invoice or statement reference) and TBet (entity TBet, self-transfer). Senders are designated per group. Ali pays Babylon and TBet; Jeton pays Bplay, Lex and TBet.",
    glance: [
      ["Senders", "Evo's customers, each designated to one group; GTSI, HG and Komodo at the selected-sender rate (not active lately)"],
      ["Receiver groups", "Bplay (Babylon, Bplay, Lex) · TBet (TBet)"],
      ["Partners and pairs", "Ali (SWIFT; collects USDT and other currencies) · Jeton (collects USDT only); USDT → EUR"],
      ["Entry mode", "Per sender: collect-first (pays what it can) or quote-first (pays the exact invoice)"],
      ["Fee", "2 % = sender 1.4 % + receiver 0.6 %, both taken at conversion on the principal at market; the sender sees only the sender rate. Selected senders: 1.0 % + 0.6 %"],
      ["Partner cost", "Ali: inside its rate (about 1 %, changes daily), comes out of NPL's parts · Jeton: 1.25 % stated separately, 0.4 % of the amount back monthly"],
      ["Screening", "C2, but up-front sender screening is skipped for senders who refuse it; the skip is recorded on the collection"],
      ["Payout", "C5 SWIFT under the narrative Bplay (or TBet), with the invoice or statement reference on the line"],
      ["Cutoff", "C9 at Ali for conversions into EUR"],
    ],
    setup: ["Client Evo, one project; two receiver groups with their entities and EUR accounts; destination approvals: Babylon and TBet at Ali, Bplay, Lex and TBet at Jeton.", "Each sender with an allow-list naming its group and an entry mode; fee overrides (1.0 % / 0.6 %) for GTSI, HG, Komodo.", "Fee structure 2 % (1.4 / 0.6) on both partner pairs; Jeton fee on market 1.25 % with rebate rule 0.4 %; Ali fee in rate.", "Ali's bank cutoff 14:30 Hong Kong time with its holidays; the USDT → EUR pair at Ali marked as needing the bank lock."],
    steps: [
      ["1", "Finance", "Morning: Ali's rate compared and confirmed (A.1, C9).", "Rate version"],
      ["2", "Operations", "Quote-first sender: quotes the exact invoice amount; the package shows the sender rate only. Collect-first sender: no quote; the deal is created when the USDT arrives.", "Finance approval if below the minimum margin"],
      ["3", "Operations", "Collects by C2. For a sender who will not be screened: records the skip and uses the partner's designated wallet for such cases.", "Hash; partner confirmation"],
      ["4", "Operations", "Instructs the conversion into EUR (A.4): both fee parts are taken here; Evo's 0.6 % comes off the EUR. At Ali after the cutoff: next business day (C9).", "Finance approval"],
      ["5", "Operations", "Prepares the SWIFT payout to the entity the sender's group names, with the invoice reference (Babylon) or the internal invoice / statement reference (Bplay, Lex, TBet) on the line; narrative Bplay or TBet.", "Finance approval"],
      ["6", "Operations", "Shares the slip; marks confirmed on Evo's confirmation. A rejected transfer: C6.", "—"],
      ["7", "Finance", "Month end: Jeton's rebate reconciled where Jeton was used (A.7).", "A.7"],
    ],
    rules: ["The receiver part is 0.6 % for every sender; only the sender part varies (1.4 % or 1.0 %).", "A payout may only go to an entity approved with the paying partner: Babylon and TBet through Ali, Bplay, Lex and TBet through Jeton. The app refuses a line to an unapproved pair.", "A payment from one group's money to the other group's entity is an offset and needs Management approval; it should not arise in normal operation.", "Other currencies via Ali (bank transfer in): the rate is taken in the morning, the deal confirmed before 14:30, the sender transfers during the day, the conversion runs when the collection is verified — same day if locked before the cutoff.", "Dormant products, kept in scope and configured but not run for years: same-currency bank pass-through (USD, EUR, GBP in and out at 2.8 % = 1.4 % + 1.4 %, converted at rate 1), CNY (6.75 %), PHP / THB / SGD / HKD (3.2 %), AED and USD cash in Dubai (5.5 %; AED cash rounded to 100, USD cash to 10). They follow this SOP with C4 or C1 for the collection and C9 for the cutoff."],
    checks: ["Before release: the line carries the invoice or statement reference; the destination is approved with the paying partner.", "Daily: pending conversions from after-cutoff locks run the next business day; unconfirmed SWIFTs chased.", "Monthly: Jeton's rebate statement; Evo's receiver parts summed for Evo's statement."],
  },
  {
    id: "npl-gr", name: "NPL-GR — Game Reseller (NPL's own business unit as the client)", client: "NPL-GR",
    purpose: "NPL buys games from vendors at wholesale and sells at retail. From the remittance side NPL-GR is a client like any other: it collects its invoice receivables — in USDT straight into NPL's own wallet (LT Sub at Aquanow; occasionally Ali's wallet held as NPL's own balance), or in THB cash through Ali for 27 Group — and pays its vendors in USDT on different days. The remittance markup covers Ali's cost and the forex movement between collection and vendor payment; the reseller revenue is fixed by the two invoices and never touched by it.",
    glance: [
      ["Customers (senders)", "Bala, Fair, 66 Group GR, TripleSeven, Alpha Plus (USDT) · 27 Group (THB cash; INR cash possible by the same procedure)"],
      ["Receivers", "NPL-GR itself; vendors SACCO SIA, Mitratech, EZ-EVO, BraversPlay paid in USDT to their wallets"],
      ["Partners", "NPL's own desk (LT Sub at Aquanow) · Ali for THB cash"],
      ["Pairs", "EUR → USDT for the customer price (invoice in EUR, paid in USDT) · THB → USDT at Ali"],
      ["Entry mode", "Quote-first against an EUR invoice or an advance"],
      ["Markup", "2 % over market on the EUR invoice value (0.75 % Fair; 1.5 % 66 Group GR, TripleSeven, Alpha Plus); the USDT amount is rounded up"],
      ["27 Group", "EUR → THB at market + 2 %; Ali's THB → USDT rate must stay within 1.5 % of market so NPL keeps at least 0.5 %; a rate outside it warns Finance, who decides"],
      ["Invoices", "The vendor's invoice at the preferential price and NPL-GR's resale invoice at retail are both recorded; the deal names the resale invoice it collects; each vendor payout line records how much of the vendor invoice it discharges and at what rate"],
      ["Payout", "C3 before each vendor payment; USDT from NPL's wallet"],
    ],
    setup: ["Client NPL-GR with its project; the own-desk partner configuration whose endpoints are NPL's own wallet (LT Sub); Ali's partner configuration for THB cash.", "Each customer as a sender with its fee structure (2 %, 1.5 % or 0.75 %); each vendor as a receiver with its wallet account, approved and screened.", "Pairs EUR → USDT (round up on the USDT) and THB → USDT (cash rounding to the thousand); Ali's rate threshold 1.5 % for THB, minimum margin 0.5 %.", "Invoices recorded as they are received (vendor) and issued (resale)."],
    steps: [
      ["1", "Finance", "Records the vendor invoice (EUR, preferential price) and NPL-GR's resale invoice (EUR, retail) when issued; both post once in EUR.", "Audited"],
      ["2", "Operations", "Quotes the customer the USDT amount for the EUR invoice (or the advance) at market + the customer's markup, rounded up (EUR 2,220 at 1 ÷ 0.8716 + 2 % = USDT 2,597.98 → 2,600). The deal names the resale invoice.", "Finance approval if below the minimum margin"],
      ["3", "Operations", "Collects the USDT by C2 into LT Sub (or, when agreed, into Ali's wallet held as NPL's balance). 27 Group: C1 cash in Bangkok through Ali at the EUR → THB rate; Ali converts THB → USDT; Finance checks Ali's rate against the 1.5 % limit.", "Hash or token photo; partner count"],
      ["4", "Operations", "Instructs the conversion (own desk: the USDT is already the converted currency; THB: Ali's conversion). The margin is recognised here.", "Finance approval"],
      ["5", "Operations", "Pays a vendor: screens the vendor's wallet (C3), prepares the USDT payout for the part of the vendor invoice being paid at that day's rate, Finance approves, the hash is shared, the vendor confirms. The line records the amount of the invoice discharged and the rate.", "Finance approval; screening record"],
      ["6", "Finance", "Watches the invoice balances (resale invoice: what the customer still owes; vendor invoice: what is still to be paid) and the forex result of each instalment, which lands on the remittance margin.", "A.6"],
    ],
    rules: ["The customer always pays an EUR value: against an invoice or as an advance against a future invoice. The quote is EUR → USDT (or EUR → THB) plus the markup.", "For 27 Group no collection is arranged if Ali's THB → USDT rate would leave less than 0.5 %: Finance asks for a better rate or declines.", "The USDT collected is NPL's own money from the moment it lands (own desk): it is NPL-GR's balance, reported with its age like any held balance.", "Vendors are paid on different days at that day's rate; the forex gain or loss between collection and payment is accepted within the markup and never charged to the reseller revenue.", "A customer who chooses to pay INR cash follows the 27 Group procedure with the INR pair."],
    checks: ["Before a vendor payment: the wallet is screened and approved; the amount does not exceed the vendor invoice's remaining balance.", "Monthly: open resale and vendor invoices; NPL-GR's profit as remittance margin plus reseller revenue."],
  },
  {
    id: "yn", name: "YN Remit — third-party invoice payments", client: "YN Remit",
    purpose: "YN Group asks NPL to pay third-party invoices: a clear sending entity, receiving entity and invoice, with the sender's KYC onboarded on Ali's PT channels. Once the route is approved on the documentation, NPL quotes first at the partner's rate plus 0.5 %; YN sends the USDT needed to cover the invoice; the invoice is paid by bank transfer.",
    glance: [
      ["Sender", "YN Group's entity named on the invoice (occasionally NPL's own entity is the declared sender when a route is not possible on the documentation)"],
      ["Receiver", "The third party named on the invoice"],
      ["Partner and pairs", "Ali (PT channels); USDT → USD, USDT → EUR, USDT → GBP"],
      ["Entry mode", "Quote-first, target amount out (the invoice value)"],
      ["Fee", "Partner rate + 0.5 % NPL markup; total to the client 0.5–2.19 % depending on Ali's rate (average 1.84 %); fee structure variable"],
      ["Collection", "C2 USDT"],
      ["Payout", "C5 SWIFT; C6 if returned; C9 cutoff"],
    ],
    setup: ["Client YN Remit, one project; sender entities with KYC references; a receiver per invoice counterparty with its bank account.", "Destination approval at Ali per route before quoting (the app will not let a quote-first deal leave Inquiry without it).", "Fee structure variable with minimum margin 0.5 %, priced on Ali's rate, on each pair."],
    steps: [
      ["1", "Operations", "Receives the invoice, the sending and receiving entity details and the KYC; asks Ali to approve the route and the destination; records the destination approval when Ali confirms.", "Ali's approval"],
      ["2", "Finance", "Confirms Ali's rate for the pair (A.1, C9 before 14:30 for bank-side pairs).", "Rate version"],
      ["3", "Operations", "Quotes the USDT needed for the invoice amount at Ali's rate + 0.5 %; sends the package.", "Finance approval if below the minimum margin"],
      ["4", "Operations", "Collects the USDT by C2.", "Hash; Ali's confirmation"],
      ["5", "Operations", "Instructs the conversion (A.4); after the cutoff, next business day (C9).", "Finance approval"],
      ["6", "Operations", "Prepares the SWIFT payout to the invoice counterparty under the sending entity named on the invoice (or NPL's entity where agreed); Finance approves; slip shared; receiver confirms. A return: C6.", "Finance approval"],
    ],
    rules: ["No quote before the route is approved: the destination approval is the gate.", "NPL's own entity as declared sender is the exception, recorded on the settlement sending entity for that payout, never the default.", "Because the fee is variable, the quote states the all-in rate; the 0.5 % markup is the minimum margin the app enforces."],
    checks: ["Before release: narrative matches the invoice's sending entity; destination approved.", "Daily: SWIFTs not confirmed within two business days chased through PT Sukses / PT Global."],
  },
  {
    id: "66", name: "66 Group — invoice payments, multi-currency and INR cash", client: "66 Group",
    purpose: "Like YN Remit: third-party invoices paid in different currencies, quote-first at Ali's rate plus NPL's markup. The difference is the collection: 66 Group almost always pays INR in cash, by token in a named city, at 7 % total (average 6 %), or occasionally into a local INR account Ali arranges for one transaction. 66 Group is also a reseller customer (see NPL-GR).",
    glance: [
      ["Sender", "66 Group (INR cash in a named city; sometimes USDT)"],
      ["Receivers", "The invoice counterparties, paid by SWIFT under NPL's name via PT Global"],
      ["Partner and pairs", "Ali; INR → USD (7 % total, partner about 5.25 %), USDT → USD (1.5 %), USDT → GBP (2.25 %)"],
      ["Entry mode", "Quote-first"],
      ["Fee", "Variable, set per deal; minimum margin 0.5 %; INR example: USD 23,960.18 at XE 90.839 + 7 % = INR 2,328,878 → rounded to 2,329,000"],
      ["Rounding", "INR cash to the nearest 1,000"],
      ["Collection", "C1 cash by token (Delhi and Mumbai have different rates) · C7 one-time local INR account on demand · C2 for USDT"],
      ["Payout", "C5 SWIFT via PT Global under NPL's name; C9 cutoff"],
    ],
    setup: ["Client 66 Group with two projects: the remittance project (this SOP) and its game-reseller purchases (under NPL-GR).", "Receivers per invoice counterparty with destination approval at Ali.", "Fee structures variable per pair with minimum and maximum markup and minimum margin 0.5 %; the INR pair with cash rounding to the thousand and rate versions per city.", "Settlement sending entity NPL via PT Global."],
    steps: [
      ["1", "Operations", "Takes the invoice and the city where the INR will be handed over; asks Ali for the route and the destination approval.", "Ali's approval"],
      ["2", "Finance", "Confirms Ali's INR rate for that city (and the USD or GBP rate for the payout side) (A.1).", "Rate version per city"],
      ["3", "Operations", "Quotes the INR amount for the invoice value at Ali's rate + markup, rounded to the thousand; sends the package.", "Finance approval if below the minimum margin"],
      ["4", "Operations", "Collects: C1 by token in the named city (token, agent contact, photo, Ali's count), or C7 into the one-time local account Ali provides, or C2 if the client pays USDT.", "Token photo and count, or deposit proof"],
      ["5", "Operations", "Instructs the conversion (A.4).", "Finance approval"],
      ["6", "Operations", "Prepares the SWIFT payout under NPL's name via PT Global; Finance approves; slip shared; receiver confirms.", "Finance approval"],
      ["7", "Operations / Finance", "A frozen local account or cash lost: loss event (A.8).", "Management approval of the split"],
    ],
    rules: ["The city must be known before anything is quoted: the rate and the agent depend on it.", "A one-time local account serves one deal and one amount; it is never reused.", "The fee is set per deal within the structure's range; Finance approves a markup above the cap (Management for raising the cap)."],
    checks: ["Before collection: destination approved; city on the deal; rate version for that city.", "Daily: cash parts counted and verified the same day; any short count recorded."],
  },
  {
    id: "gdc", name: "GDC — USDT to USD, fee by monthly volume", client: "GDC",
    purpose: "GDC converts USDT to USD and wants the funds in its own bank accounts; sender and receiver are the same client, with several receiving entities (Adu Ads, Ad Fusion, TDC, Pixel Labs). GDC specifies how much goes to which account. The rate is 1 : 1 plus 2.5 %, lowered to 2.25 % once the calendar-month volume passes USD 500,000.",
    glance: [
      ["Sender and receiver", "GDC; receiving entities Adu Ads, Ad Fusion, TDC, Pixel Labs (and others GDC names)"],
      ["Partner and pair", "Ali; USDT → USD at 1 : 1"],
      ["Entry mode", "Quote-first, target amount out (the USD GDC needs)"],
      ["Fee", "2.5 % on the USD amount up to USD 500,000 in the calendar month; 2.25 % above it (the crossing deal is split across the two tiers); Ali's cost 0.4 %; minimum margin 1.8 %"],
      ["Narrative", "NPL's entity New Pinnacle Ltd (the contracting entity for GDC)"],
      ["Collection", "C2 USDT"],
      ["Payout", "C5 SWIFT via PT Global; C9 cutoff"],
    ],
    setup: ["Client GDC, one project; one receiver with several receiving-entity accounts, each approved at Ali.", "Fee structure with two tiers (2.5 % from 0, 2.25 % from USD 500,000, by calendar month, counting the client as a whole); minimum margin 1.8 %.", "Settlement sending entity New Pinnacle Ltd."],
    steps: [
      ["1", "Operations", "Takes GDC's instruction: the USD amount per receiving account.", "—"],
      ["2", "Operations", "Quotes the USDT needed: USD + 2.5 % (or 2.25 %); the app picks the tier from the month's volume so far and splits a deal that crosses the threshold (USD 84,482 + 2.5 % = USDT 86,594; at 2.25 %, 86,383).", "Finance approval if below the minimum margin"],
      ["3", "Operations", "Collects the USDT by C2.", "Hash; Ali's confirmation"],
      ["4", "Operations", "Instructs the conversion to USD (A.4; C9 if locked after the cutoff).", "Finance approval"],
      ["5", "Operations", "Prepares the SWIFT payout lines, one per receiving account as instructed, narrative New Pinnacle Ltd; Finance approves; slips shared; GDC confirms.", "Finance approval"],
    ],
    rules: ["The tier is chosen from the project's month-to-date volume at the time of the quote and stamped on the deal; later deals in the month follow the lower tier once it is reached. Usual volumes are below USD 200,000; the threshold has been crossed once.", "Several lines in one settlement, one per receiving account, each within the entitlement."],
    checks: ["Monthly: the volume counter resets with the calendar month; Finance confirms the tier applied on the first deals of the month."],
  },
  {
    id: "peru", name: "Peru remittance — bank transfer in, USDT out", client: "Peru remittance",
    purpose: "The client sends a bank transfer to Ali's receiving entity in Indonesia (PT Silver Lining Production); Ali converts it to USDT at its rate (3 %) and NPL adds 1 %; the USDT is paid to the client's wallet.",
    glance: [
      ["Sender", "The Peru client, by bank transfer"],
      ["Receiver", "The client's USDT wallet"],
      ["Partner and pair", "Ali (PT Silver Lining Production); USD → USDT"],
      ["Entry mode", "Collect-first or quote-first as agreed"],
      ["Fee", "4 % total: Ali 3 % inside its rate + NPL 1 % (USD 299,350 − 4 % = USDT 287,376)"],
      ["Collection", "C4 bank transfer in"],
      ["Payout", "C3 wallet screened, then USDT payout"],
    ],
    setup: ["Client and project; Ali's receiving entity PT Silver Lining Production with its bank endpoint and rail; the client's wallet account with destination approval and screening.", "Partner pair USD → USDT fee in rate, NPL 1 %."],
    steps: [
      ["1", "Operations", "Collects the sender's profile and bank account; Ali approves and provides PT Silver Lining Production's account (C4).", "Ali's approval"],
      ["2", "Operations", "Shares the account; the client transfers and shares the proof; Ali confirms; Operations verifies.", "Proof; Ali's confirmation"],
      ["3", "Operations", "Instructs the conversion to USDT at Ali's rate; NPL's 1 % is taken here.", "Finance approval"],
      ["4", "Operations", "Screens the client's wallet (C3), prepares the USDT payout, Finance approves, hash shared, client confirms.", "Finance approval"],
    ],
    rules: ["Ali's 3 % is inside its rate; the client sees 4 % all-in."],
    checks: ["Before conversion: the incoming transfer matched to the client's proof."],
  },
  {
    id: "jtn", name: "JTN — USDT in, JPY cash out", client: "JTN",
    purpose: "JTN sends USDT to Ali; Ali converts to JPY cash and hands it over by token to the same party in the named city. The day's rate is compared and quoted with a variable markup of 0.2–0.5 %; total fee 1–1.8 %.",
    glance: [
      ["Sender and receiver", "JTN (the same party on both sides)"],
      ["Partner and pair", "Ali; USDT → JPY"],
      ["Entry mode", "Quote-first"],
      ["Fee", "Ali's rate + 0.2–0.5 % markup (maximum 0.5 %); total 1–1.8 %; fee structure variable with the cap"],
      ["Rounding", "JPY cash to the nearest 1,000"],
      ["Collection", "C2 USDT"],
      ["Payout", "C1 cash by token (settlement side); no bank cutoff on a cash payout"],
    ],
    setup: ["Client and project; JTN as sender and as receiver (cash); partner pair USDT → JPY, variable fee with maximum markup 0.5 %; rate versions per city; cash rounding to the thousand."],
    steps: [
      ["1", "Finance", "Takes Ali's JPY rate for the city and compares it (A.1).", "Rate version per city"],
      ["2", "Operations", "Quotes with a markup chosen within 0.2–0.5 % according to how Ali's rate sits against market; sends the package (150,000 USDT at 156.06 = JPY 23,409,000).", "Finance approval if above the cap or below the minimum margin"],
      ["3", "Operations", "Collects the USDT by C2.", "Hash; Ali's confirmation"],
      ["4", "Operations", "Instructs the conversion to JPY (A.4).", "Finance approval"],
      ["5", "Operations", "Payout by C1: JTN provides the token up front; Operations passes it to Ali and the agent; Finance approves the payout; the agent hands over the cash and photographs the token; the photo goes to JTN; JTN confirms.", "Finance approval; token photo"],
    ],
    rules: ["The markup never exceeds 0.5 %: a higher figure needs Management to raise the cap.", "Cash short at hand-over is a shortfall, adjusted at the next deal or paid separately."],
    checks: ["Before payout: the receiver's token recorded on the line; the city on the deal."],
  },
  {
    id: "jonas", name: "Ad hoc INR cash (Jonas) — INR cash in, USD, SGD or USDT out", client: "Jonas",
    purpose: "INR cash collected by token in a named city (rates differ between Delhi and Mumbai) at 7 % total, paid out in USD, SGD or USDT.",
    glance: [
      ["Sender and receiver", "Jonas"],
      ["Partner and pairs", "Ali; INR → USD, INR → SGD, INR → USDT"],
      ["Entry mode", "Quote-first"],
      ["Fee", "7 % total (Ali 5.5–7.5 % inside its rate; NPL's margin per deal); INR 8,500,000 at 79.529 = USD 106,879"],
      ["Rounding", "INR cash to the nearest 1,000"],
      ["Collection", "C1 cash by token in the named city"],
      ["Payout", "C3 wallet (USDT) or C5 SWIFT (USD, SGD); C9 cutoff on the bank side"],
    ],
    setup: ["Client and project; Jonas as sender and receiver with its wallet and bank accounts approved; INR pairs with cash rounding to the thousand and rate versions per city."],
    steps: [
      ["1", "Operations", "Takes the city; Finance takes Ali's INR rate for that city and compares it (A.1).", "Rate version per city"],
      ["2", "Operations", "Quotes the payout amount for the INR to be handed over, rounded to the thousand; sends the package.", "Finance approval if below the minimum margin"],
      ["3", "Operations", "Collects by C1: token and agent from Ali, meeting, cash handed over, token photo, Ali's count; verifies the part.", "Token photo; count"],
      ["4", "Operations", "Instructs the conversion (A.4); on a bank-side payout currency the cutoff applies (C9).", "Finance approval"],
      ["5", "Operations", "Pays out by C3 (USDT) or C5 (USD, SGD); Finance approves; confirmation closes the line.", "Finance approval"],
    ],
    rules: ["Delhi and Mumbai are different rate versions; the deal carries its city.", "A customer of NPL-GR paying INR cash follows the same collection steps under the NPL-GR SOP."],
    checks: ["Same-day count and verification of every cash part."],
  },
  {
    id: "ak", name: "AK Personal — a stakeholder's account, balance held at the partner", client: "AK Personal",
    purpose: "A stakeholder's account operated with Ali. Collections and conversions happen as on any project, but the balance is not paid out: it stays at Ali in USD, SGD and USDT, up to about USD 400,000 equivalent (revised from time to time), and is paid out on request. No markup.",
    glance: [
      ["Sender and receiver", "The stakeholder"],
      ["Partner and pairs", "Ali; USDT → USD, USDT → SGD, INR → USD (cash)"],
      ["Entry mode", "Collect-first"],
      ["Fee", "0 %: conversions at Ali's rate (USDT 10,000 × 0.996); minimum margin 0 %"],
      ["Balance", "Held at Ali in USD, SGD, USDT; settlement policy 'hold allowed'; exposure ceiling about USD 400,000 equivalent, compared in the reporting currency"],
      ["Collection", "C2 USDT · C1 INR cash"],
      ["Conversions between held currencies", "Balance conversion: Finance requests, Management approves; USD and SGD are banking-ready balances bound by the cutoff (C9): 10,000 USDT collected at night converts to SGD the next business morning"],
      ["Withdrawals", "On request: C8 local bank payment, C5 SWIFT, C3 USDT, C1 cash; a one-time local account where needed"],
    ],
    setup: ["Client and project with settlement policy hold allowed and the exposure ceiling; fee structures at 0 % with minimum margin 0 %; the stakeholder's accounts (bank, wallet) approved at Ali; pairs for the held currencies; Ali's cutoff."],
    steps: [
      ["1", "Operations", "Collects by C2 (USDT) or C1 (INR cash); verifies; the deal is priced at conversion with no markup.", "Hash or token photo"],
      ["2", "Operations", "Instructs the conversion into the currency the stakeholder wants held (A.4); USD and SGD after the cutoff convert the next business morning (C9).", "Finance approval"],
      ["3", "Finance", "Keeps the balance at Ali; the app shows it per currency and its age; a conversion between held currencies is a balance conversion requested by Finance and approved by Management.", "Management approval"],
      ["4", "Operations", "On a withdrawal request: prepares the payout by the method asked (C8, C5, C3 or C1); Finance approves; confirmation closes the line.", "Finance approval; Management above the limit"],
      ["5", "Finance", "Watches the ceiling: a release or a collection that would carry the balance over about USD 400,000 equivalent is blocked until Management revises the ceiling.", "A.7"],
    ],
    rules: ["No markup, no fee: the only figures are Ali's rate and the amounts.", "Held balances are reported with their age like any client money at a partner; they are not an exception, they are the policy of this project."],
    checks: ["Daily: the balance per currency against Ali's statement; the ceiling in the reporting currency."],
  },
  {
    id: "other", name: "Other clients on the invoice-payment pattern (Kingdom, Working Lab)", client: "Kingdom · Working Lab",
    purpose: "Smaller clients handled exactly like YN Remit: quote-first at Ali's rate plus NPL's markup, USDT in and bank transfer out (Kingdom: USDT → USD at 0.9 %, USD 50,000 + 0.9 % = USDT 50,540) or bank transfer in and USDT out (Working Lab: USD → USDT at about 0.75 %, USD 10,000 − 0.75 % = USDT 9,925).",
    glance: [["Procedure", "The YN Remit SOP, with C2 in and C5 out (Kingdom) or C4 in and C3 out (Working Lab)"], ["Fee", "Fixed 0.9 % (Kingdom); about 0.75 %, set per deal (Working Lab)"]],
    setup: ["Client and project each; the client's accounts approved at Ali; the fee structure of the fee table."],
    steps: [["1", "Operations", "Follows the YN Remit steps 1–6 with the client's pair and fee.", "As YN Remit"]],
    rules: ["Nothing particular: a new client of this kind is set up from the Configuration Schema and runs on this SOP."],
    checks: ["As YN Remit."],
  },
];

// ------------------------------------------------------------------ HTML
const CSS = `
@page { size: A4; margin: 18mm 18mm 16mm 18mm; @bottom-center { content: counter(page); font: 8pt Georgia, serif; color: #666 } }
body{font:10.5pt/1.45 Georgia,"Times New Roman",serif;color:#111;margin:0}
h1{font:700 17pt Helvetica,Arial,sans-serif;color:#2f5d9e;text-align:center;margin:0 0 4pt}
h2{font:700 13pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:18pt 0 6pt;break-after:avoid}
h3{font:700 11pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:14pt 0 4pt;break-after:avoid}
h4{font:700 10pt Helvetica,Arial,sans-serif;margin:12pt 0 3pt;break-after:avoid}
p{margin:0 0 7pt} ul,ol{margin:0 0 8pt 16pt;padding:0} li{margin:0 0 3pt}
code,.mono{font:8.8pt Menlo,Consolas,monospace}
table{border-collapse:collapse;width:100%;table-layout:fixed;margin:4pt 0 8pt;font-size:9.2pt}
th{text-align:left;font-weight:600;border-bottom:1px solid #333;padding:3pt 5pt;vertical-align:bottom;background:#f3f6fb}
td{padding:3pt 5pt;border-bottom:1px solid #ddd;vertical-align:top} td,th{overflow-wrap:anywhere}
tr{break-inside:avoid}
td.k{font-weight:700}
.title{text-align:center;margin-top:40mm}
.title .sub{font:700 13pt Helvetica,Arial,sans-serif;color:#2f5d9e;margin:0 0 10pt}
.title .org{margin:0 0 2pt} .title .date{margin:0 0 16pt}
.rule{border-top:2px solid #222;border-bottom:1px solid #222;height:2px;margin:10pt 0 14pt}
.pb{break-before:page}
.box{border:1px solid #2f5d9e;background:#f3f6fb;padding:6pt 9pt;margin:8pt 0;font-size:9.8pt}
.small{font-size:9pt;color:#444}
.sop{break-before:page}
.sop .purpose{font-size:10.2pt;border-left:3px solid #2f5d9e;padding:2pt 8pt;margin:6pt 0 10pt;background:#fbfbf6}
`;

const common = COMMON.map(([code, name, when, steps, evidence]) => `<h3 id="${code}">${code} · ${esc(name)}</h3>
<p class="small"><b>When:</b> ${esc(when)}</p>
<table><thead><tr><th style="width:20%">Who</th><th>Does</th></tr></thead><tbody>
${steps.map(([who, does], i) => `<tr><td class="k">${i + 1}. ${esc(who)}</td><td>${esc(does)}</td></tr>`).join("")}
</tbody></table>
<p class="small"><b>Recorded:</b> ${esc(evidence)}</p>`).join("");

const standing = STANDING.map(([code, name, items]) => `<h3 id="${code}">${code} · ${esc(name)}</h3><ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`).join("");

const sop = (p, i) => `<section class="sop" id="${p.id}">
<h2>B.${i + 1} · ${esc(p.name)}</h2>
<p class="purpose">${esc(p.purpose)}</p>
<h4>At a glance</h4>
<table><tbody>${p.glance.map(([k, v]) => `<tr><td class="k" style="width:24%">${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</tbody></table>
<h4>Before the first deal — configuration in place</h4>
<ul>${p.setup.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
<h4>Procedure</h4>
<table><thead><tr><th style="width:5%">#</th><th style="width:13%">Who</th><th>Does</th><th style="width:22%">Control and evidence</th></tr></thead><tbody>
${p.steps.map(([n, who, does, ctl]) => `<tr><td>${esc(n)}</td><td class="k">${esc(who)}</td><td>${esc(does)}</td><td class="small">${esc(ctl)}</td></tr>`).join("")}
</tbody></table>
<h4>Rules particular to this project</h4>
<ul>${p.rules.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
<h4>Checks</h4>
<ul>${p.checks.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
</section>`;

const actionsTable = `<table><thead><tr><th style="width:38%">Controlled action</th><th style="width:16%">Initiates</th><th style="width:16%">Approves</th><th>Management as well when</th></tr></thead><tbody>
${ACTIONS.map((a) => `<tr><td>${esc(a[0])}</td><td>${esc(a[1].replace(/\s*\(.*$/, ""))}</td><td>${esc(a[2].replace(/\s*\(.*$/, ""))}</td><td class="small">${esc(a[3].split(/[;:]/)[0])}</td></tr>`).join("")}
</tbody></table>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>NPLify — Operating Procedures</title><style>${CSS}</style></head><body>
<div class="title"><h1>NPLify · P0 Technical Baseline</h1><p class="sub">Operating Procedures — one SOP per project · Draft v${V}</p><p class="org">New XP Technologies Limited</p><p class="date">${DATE} · Confidential</p></div>
<p>This document says how each of NPL's projects is run day to day in NPLify: who does what, in which order, with which approval and which evidence. It is written from NPL's own description of each project, its fee table and its payment-method steps, and from the model the application is built on, so every step names the record the application keeps. <b>Part A</b> is the procedures every project shares — the eleven common procedures for collecting, approving and paying out, and the standing procedures of the day. <b>Part B</b> is one standard operating procedure per project, which refers to Part A by number rather than repeating it.</p>
<div class="box"><b>Three roles, one rule.</b> <b>Operations</b> runs deals: quotes, screens, collects, instructs conversions, prepares payouts, records what happened. <b>Finance</b> approves what Operations initiates, confirms the partner rates of the day, resolves exceptions, reconciles every evening and at month end. <b>Management</b> approves the heavier actions: anything above a limit, configuration, users, offsets, balance conversions, loss splits, covered fees. Every controlled action is maker-checker: the person who initiates never approves. Operations never sees NPL's margin, the partner's cost, the pool or a ledger balance; the sender sees only the sender-facing figures.</div>
<div class="rule"></div>

<h2>Part A · Common procedures</h2>
<p>The common procedures below are the ten shared flows of the scenario catalogue (${Object.keys(FLOWS).map((k) => k + " " + FLOWS[k]).join("; ")}), written as steps, and the Email OTP procedure C11. A project SOP cites them by code.</p>
${common}

<h2 class="pb">Part A · Standing procedures of the day</h2>
${standing}

<h3>A.9 · Who may do what — quick reference</h3>
<p class="small">The approving person is always different from the initiator. The last column names the conditions that add Management's approval on top of Finance's. The full list with rejection handling is in the Lifecycle &amp; Approvals document.</p>
${actionsTable}
<h3 id="A.10">A.10 · People joining and leaving</h3><ul>
<li>A new account is created on the day the person starts, with one role and the person named behind it (USER.person_ref); Management approves. Nobody holds two accounts that can approve each other's requests.</li>
<li>A leaver's account is closed the same day, before the end of the day's work: the role removed, the account disabled, the person removed from the share lists of the two fallback workbooks, and any pending request of theirs dropped or reassigned. Finance does it, Management confirms; the audit log carries both.</li>
<li>Every quarter Management confirms the list of users and their roles, the rights per controlled action, the share lists of the two workbooks against the user list, and, per project, the senders' registered approver addresses and chat groups for Email OTP (Roles &amp; Visibility rule 12, rule 13 and 5a).</li>
</ul>
<h3 id="A.11">A.11 · The health checks</h3><ul>
<li>Every morning Finance reads the alarm mailbox and the exception list before the first deal. A job that stopped after three attempts or a run the sweep found missing is an exception until Engineering has cleared it and the job-health line on the monitor is green again; the alarm names the job, the time and the event, never a figure (Architecture &amp; Stack 4 and 5).</li>
<li>Every month Engineering restores last week's backup into a scratch database and runs the restore checks (the ledger identities, every evidence reference, every type-plus-id reference); the result is recorded with its time. Every year the rehearsal is the region case: the standby database promoted in the second region, the application started there, every step timed, and the measured recovery time and data loss reported to NPL (Cutover Approach 8a; Test Strategy G-REST).</li>
<li>The two fallback workbooks are checked weekly for freshness (an export every five minutes) and for their share lists (A.10).</li>
</ul>
<h3 id="A.12">A.12 · Working from the fallback workbook</h3><ul>
<li>When the application cannot be used, Finance declares the outage with its time and tells the team; from then on Operations works from the Operations workbook (open deals and their states, cutoffs, pending approvals, the day's partner rates as entered, the amount available to pay out per partner and currency) and Finance from the Finance workbook (balances, pool, margins, reconciliation figures). Both are refreshed every five minutes while the application runs, so they start from the last five minutes before the outage.</li>
<li>Every instruction given to a partner during the outage is written in the workbook with the deal reference, the partner's reference and the time, and the partner's confirmation is kept; nothing is instructed twice for the same promise, and nothing new is quoted unless Management says so.</li>
<li>When the application is back, the recovery runbook of Cutover Approach 8a applies: Engineering identifies the last committed transaction, Operations and Finance re-enter everything after it from the workbook and the partner confirmations in time order, with the real times in the evidence, and Finance reconciles every partner balance before the first new deal. Management records the resumption.</li>
</ul>

<h2 class="pb">Part B · One SOP per project</h2>
<p>Each SOP has the same shape: what the project is for; the parties, partners, pairs and fee at a glance; the configuration that must be in place before the first deal; the procedure step by step with the control and the evidence at each step; the rules particular to the project; and the checks. The projects:</p>
<ol>${PROJECTS.map((p, i) => `<li><a href="#${p.id}">B.${i + 1} ${esc(p.name)}</a></li>`).join("")}</ol>
${PROJECTS.map(sop).join("")}

<h2 class="pb">Part C · Starting a new project</h2>
<ol>
<li><b>Classify it</b> against Part B: which SOP is it closest to — an invoice-payment project (YN Remit), a funding project with a fixed fee (BF), a shared-markup arrangement (BF Sub), a cash project (JTN, Jonas), a held-balance account (AK Personal), or NPL's own desk (NPL-GR)?</li>
<li><b>Configure it</b> from the Configuration Schema: client and project, parties and their accounts, partner configuration with the pairs and the fee structure (fixed, variable with a cap, tiered, shared), destination approvals, templates. Finance proposes, Management approves; the validation must pass before the first deal.</li>
<li><b>If it is cloned from an archetype or another project</b>, the clone copies structure, not agreements. The new project records its source, and every copied row carries it until a user confirms or changes the row. The reconfirm list is left empty on purpose and must be set by hand: on the project, the client, the name and label, the exposure ceiling, the settlement policy and every threshold with an amount or currency; per partner pair, the fee percentage and its parts, the tiers, the minimum and maximum markup and the rate basis; per partner block, the partner entities, endpoints, settlement sending entities and rails, destination approvals, rebate rule and markup shares; the parties, accounts, bank account details and allow-lists. A partner's cutoff, time zone and holidays are never copied. Activation is refused with a field-level list of what is missing until every copied row is confirmed, every referenced version is the one in force on the activation date, and every block's route is complete (Configuration Schema 1a and rule 15).</li>
<li><b>Write its SOP</b> on the template of Part B — at a glance, configuration, procedure, rules, checks — citing the common procedures by code. Any step not covered by Part A is a question for Management before the project runs, not a workaround.</li>
<li><b>Run the first deal with Finance on the screen</b>, reconcile it the same evening, and only then hand the project to the normal rota.</li>
</ol>
<p class="small"><i>Draft v${V} — for review with NPL. Figures in the examples are NPL's own from its fee table where quoted; the rest are illustrative.</i></p>
</body></html>`;

const h = path.join(outDir, `NPLify-Operating-Procedures-v${V}.html`), p = path.join(outDir, `NPLify-Operating-Procedures-v${V}.pdf`);
fs.writeFileSync(h, clientFacing(html));
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${p}`, "file://" + h], { stdio: "ignore" });
console.log("wrote", p, `(${(fs.statSync(p).size / 1024).toFixed(0)} KB)`, "common:", COMMON.length, "standing:", STANDING.length, "projects:", PROJECTS.length);

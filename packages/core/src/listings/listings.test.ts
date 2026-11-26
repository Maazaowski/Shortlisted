import { describe, expect, it } from "vitest";
import { classifyField, isTech } from "./fields.js";
import { classifyListing, feedFamilies, type RawListing } from "./feed.js";
import { findPlaces } from "./places.js";
import { admitsCountry, remoteScope } from "./remote.js";
import { extractSkills } from "./skills.js";
import { sponsorship } from "./sponsorship.js";

describe("findPlaces", () => {
  it.each([
    ["Dubai, UAE", ["AE"]],
    ["Riyadh, Saudi Arabia", ["SA"]],
    ["Doha", ["QA"]],
    ["Austin, TX", ["US"]],
    ["London, UK", ["GB"]],
    ["Berlin, Germany", ["DE"]],
    ["Lahore, Pakistan", ["PK"]],
    ["Bengaluru, India", ["IN"]],
    ["San Francisco, CA or New York, NY", ["US"]],
    ["Toronto, Canada", ["CA"]],
  ])("reads the country from %s", (text, countries) => {
    expect(findPlaces(text).countries.sort()).toEqual(countries);
  });

  it("reads regions, the more specific phrase first", () => {
    expect(findPlaces("Remote - EMEA").regions).toEqual(["EMEA"]);
    expect(findPlaces("Asia Pacific").regions).toEqual(["APAC"]);
    expect(findPlaces("Remote, Europe or LATAM").regions.sort()).toEqual(["EUROPE", "LATAM"]);
    expect(findPlaces("EU only").regions).toEqual(["EU"]);
    expect(findPlaces("Remote, AMER").regions).toEqual(["AMERICAS"]);
  });

  it("does not read lowercase us or the state of Georgia as countries", () => {
    expect(findPlaces("join us in building this").countries).toEqual([]);
    expect(findPlaces("Atlanta, Georgia").countries).toEqual(["US"]);
  });
});

describe("remoteScope from the location field", () => {
  it.each([
    ["Remote", "remote", [], "unclear"],
    ["Remote - Worldwide", "remote", ["WORLD"], "stated"],
    ["Anywhere", "remote", ["WORLD"], "stated"],
    ["Remote (US)", "remote", ["US"], "stated"],
    ["Remote, United States", "remote", ["US"], "stated"],
    ["Remote - EMEA", "remote", ["EMEA"], "stated"],
    ["Remote, APAC", "remote", ["APAC"], "stated"],
    ["Remote - Europe", "remote", ["EUROPE"], "stated"],
    ["Remote, Canada", "remote", ["CA"], "stated"],
    ["Remote - LATAM", "remote", ["LATAM"], "stated"],
    ["Remote UK", "remote", ["GB"], "stated"],
    ["Remote, India", "remote", ["IN"], "stated"],
  ] as const)("%s", (location, mode, allowed, confidence) => {
    const scope = remoteScope(location, "We build things.");
    expect(scope.mode).toBe(mode);
    expect(scope.allowed).toEqual(allowed);
    expect(scope.confidence).toBe(confidence);
  });

  it.each([
    ["Dubai, UAE", "onsite", ["AE"]],
    ["Riyadh", "onsite", ["SA"]],
    ["Berlin, Germany (Hybrid)", "hybrid", ["DE"]],
    ["London", "onsite", ["GB"]],
    ["Kuwait City, Kuwait", "onsite", ["KW"]],
  ] as const)("%s is an office role", (location, mode, countries) => {
    const scope = remoteScope(location, "Join our office team.");
    expect(scope.mode).toBe(mode);
    expect(scope.countries).toEqual(countries);
    expect(scope.allowed).toEqual([]);
  });
});

describe("remoteScope from the body", () => {
  it.each([
    ["You must be based in the United States.", ["US"]],
    ["Candidates must be located in Canada or the US.", ["CA", "US"]],
    ["You need to be authorized to work in the UK.", ["GB"]],
    ["This role is open to candidates based in Europe.", ["EUROPE"]],
    ["We are only able to hire in Germany, Spain and Portugal for this role.", ["DE", "ES", "PT"]],
    ["This position is restricted to residents of the European Union.", ["EU"]],
    ["Must reside in LATAM.", ["LATAM"]],
    ["US-based applicants only.", ["US"]],
  ])("a restriction: %s", (sentence, allowed) => {
    const scope = remoteScope("Remote", `About us. ${sentence} Great benefits.`);
    expect(scope.allowed.sort()).toEqual([...allowed].sort());
    expect(scope.confidence).toBe("stated");
    expect(scope.evidence).toContain(sentence.slice(0, 20));
  });

  it.each(["Work from anywhere in the world.", "We hire talent from anywhere.", "We are location-agnostic and async.", "Join from any country."])("anywhere, said in the body: %s", (sentence) => {
    const scope = remoteScope("Remote", `About us. ${sentence}`);
    expect(scope.allowed).toEqual(["WORLD"]);
    expect(scope.confidence).toBe("likely");
  });

  it("reads a region after anywhere as that region, not the world", () => {
    const scope = remoteScope("Remote", "This role is remote-first, so it can be executed from anywhere in Europe.");
    expect(scope.allowed).toEqual(["EUROPE"]);
    expect(scope.confidence).toBe("likely");
  });

  it("uses a region in the title when the field only says Remote", () => {
    const scope = remoteScope("Remote", "We sell software.", { title: "Renewals Manager EMEA" });
    expect(scope.allowed).toEqual(["EMEA"]);
    expect(scope.confidence).toBe("likely");
  });

  it.each([
    "Our hiring range is $200,000 for most US-based locations.",
    "For US-based applicants: this position is part of a bargaining unit.",
    "Open to candidates across UTC+2 to UTC-4 (Central European through Eastern Time).",
  ])("does not read a restriction into: %s", (sentence) => {
    expect(remoteScope("Remote", sentence).allowed).toEqual([]);
  });

  it("a restriction in the body beats Worldwide in the field", () => {
    const scope = remoteScope("Remote, Worldwide", "You must be based in the United States.");
    expect(scope.allowed).toEqual(["US"]);
  });

  it("keeps exclusions apart from the allowed list", () => {
    const scope = remoteScope("Remote - Worldwide", "We are unable to hire in Pakistan, Russia or Iran.");
    expect(scope.excluded.sort()).toEqual(["IR", "PK", "RU"]);
    expect(admitsCountry(scope, "PK")).toBe("no");
    expect(admitsCountry(scope, "EG")).toBe("yes");
  });

  it("a time zone requirement alone stays unclear, with the sentence kept", () => {
    const scope = remoteScope("Remote", "You should overlap with working hours in EST.");
    expect(scope.allowed).toEqual([]);
    expect(scope.confidence).toBe("unclear");
    expect(scope.evidence).toContain("EST");
  });

  it("reads a fully remote role whose location field is the head office", () => {
    const scope = remoteScope("San Francisco, CA", "This is a fully remote position. Work from anywhere.");
    expect(scope.mode).toBe("remote");
    expect(scope.allowed).toEqual(["US"]);
  });

  it("uses a board's remote flag and country as likely scope", () => {
    const scope = remoteScope("Amsterdam", "Join us.", { remote: true, countryCode: "nl" });
    expect(scope.mode).toBe("remote");
    expect(scope.allowed).toEqual(["NL"]);
  });
});

describe("admitsCountry", () => {
  it("answers for Pakistan across regions", () => {
    expect(admitsCountry(remoteScope("Remote - Worldwide", ""), "PK")).toBe("yes");
    expect(admitsCountry(remoteScope("Remote, APAC", ""), "PK")).toBe("yes");
    expect(admitsCountry(remoteScope("Remote - Asia", ""), "PK")).toBe("yes");
    expect(admitsCountry(remoteScope("Remote - EMEA", ""), "PK")).toBe("no");
    expect(admitsCountry(remoteScope("Remote (US)", ""), "PK")).toBe("no");
    expect(admitsCountry(remoteScope("Remote", ""), "PK")).toBe("unclear");
    expect(admitsCountry(remoteScope("Dubai, UAE", ""), "PK")).toBe("no");
  });

  it("answers for other home countries from the same scope", () => {
    const emea = remoteScope("Remote - EMEA", "");
    expect(admitsCountry(emea, "EG")).toBe("yes");
    expect(admitsCountry(emea, "NG")).toBe("yes");
    expect(admitsCountry(emea, "BR")).toBe("no");
  });
});

describe("sponsorship", () => {
  it.each([
    "We offer visa sponsorship for this role.",
    "Visa sponsorship is available for the right candidate.",
    "We will sponsor your work visa and help you move.",
    "We can sponsor visas for exceptional candidates.",
    "Immigration support is provided by our people team.",
    "H-1B transfer is supported.",
    "Blue Card sponsorship is provided for non-EU hires.",
  ])("offered: %s", (sentence) => {
    const s = sponsorship(`About the role. ${sentence} Apply now.`);
    expect(s.visa).toBe("offered");
    expect(s.evidence).toBe(sentence);
  });

  it.each([
    "We are unable to sponsor visas for this position.",
    "This role does not offer visa sponsorship.",
    "No sponsorship is available.",
    "You must be able to work in the US without sponsorship.",
    "Sponsorship is not available for this role.",
    "Visa sponsorship: Not available for this role.",
    "Applicants must already have the right to work in the UK.",
    "We cannot provide visa sponsorship at this time.",
    "Candidates must be authorized to work without the need for current or future sponsorship.",
    "Candidates must be currently authorized to work in the United States on a full-time basis without the need for employer visa sponsorship.",
    "As a result, visa sponsorship and relocation support are not available for this position.",
  ])("refused: %s", (sentence) => {
    const s = sponsorship(`About the role. ${sentence} Apply now.`);
    expect(s.visa).toBe("refused");
    expect(s.evidence).toBe(sentence);
  });

  it("says unknown when the posting is silent", () => {
    expect(sponsorship("Build APIs with us. Great team.")).toEqual({ visa: "unknown", relocation: "unknown", evidence: null, countries: [] });
  });

  it("reads a refusal whose negation is far from the word sponsorship", () => {
    const s = sponsorship(
      "For US based roles only, please note the Company may not be able to employ candidates for this role who have United States work authorization related to certain U.S. visa categories, or support future H-1B sponsorship at this time.",
    );
    expect(s.visa).toBe("refused");
  });

  it.each([
    "To help make a change, we sponsor bright women from disadvantaged backgrounds through their university degrees in science and mathematics.",
    "We sponsor meetups and open source projects.",
    "Tier 2 support for any escalated client issues related to financial instruments.",
  ])("not about visas: %s", (sentence) => {
    expect(sponsorship(sentence).visa).toBe("unknown");
  });

  it("still reads a tier 2 visa offer", () => {
    expect(sponsorship("Tier 2 sponsorship is available for this role.").visa).toBe("offered");
  });

  it("a refusal outranks an offer elsewhere in the text", () => {
    expect(sponsorship("Visa sponsorship is available in Germany. We are unable to sponsor visas in the US.").visa).toBe("refused");
  });

  it.each(["Relocation assistance is provided.", "We offer a relocation package to Dubai.", "We will help you relocate to Berlin."])("relocation offered: %s", (sentence) => {
    expect(sponsorship(sentence).relocation).toBe("offered");
  });

  it("does not read a refusal to relocate as an offer", () => {
    expect(sponsorship("We do not offer relocation assistance.").relocation).toBe("unknown");
    expect(sponsorship("Relocation assistance will not be provided for this role.").relocation).toBe("unknown");
  });
});

describe("classifyField", () => {
  it.each([
    ["Senior Backend Engineer", "software-engineering"],
    ["Full Stack Developer (React/Node)", "software-engineering"],
    ["iOS Engineer", "software-engineering"],
    ["Machine Learning Engineer", "data-ai"],
    ["Data Analyst", "data-ai"],
    ["Site Reliability Engineer", "devops-cloud"],
    ["Platform Engineer", "devops-cloud"],
    ["Application Security Engineer", "security"],
    ["QA Automation Engineer", "qa-testing"],
    ["Product Designer", "design"],
    ["UX Researcher", "design"],
    ["Senior Product Manager", "product"],
    ["Customer Support Specialist", "customer-support"],
    ["Technical Support Engineer", "customer-support"],
    ["Account Executive, Mid-Market", "sales"],
    ["Sales Engineer", "sales"],
    ["Content Marketing Manager", "marketing"],
    ["SEO Specialist", "marketing"],
    ["Technical Writer", "writing"],
    ["Financial Analyst", "finance"],
    ["Senior Accountant", "finance"],
    ["Technical Recruiter", "hr-recruiting"],
    ["People Operations Manager", "hr-recruiting"],
    ["Operations Manager", "operations"],
    ["Executive Assistant", "operations"],
    ["Strategy Consultant", "consulting-strategy"],
    ["Legal Counsel", "other"],
    ["Account Development Representative - DACH", "sales"],
    ["Renewals Manager EMEA", "sales"],
    ["SVP, Product", "product"],
    ["International Infrastructure Accounting", "finance"],
    ["Senior Infrastructure Engineer", "devops-cloud"],
    ["Specialist, CSIRT", "security"],
  ])("%s is %s", (title, field) => {
    expect(classifyField(title)).toBe(field);
  });

  it("knows which fields are tech", () => {
    expect(isTech("data-ai")).toBe(true);
    expect(isTech("sales")).toBe(false);
  });
});

describe("extractSkills", () => {
  it("finds known skills and normalises their spelling", () => {
    const skills = extractSkills("You know Node.js, PostgreSQL and React. Kubernetes (k8s) is a plus. CI/CD with GitHub Actions.");
    expect(skills).toEqual(expect.arrayContaining(["node", "postgres", "react", "kubernetes", "ci cd", "github actions"]));
  });

  it("does not find skills inside other words", () => {
    expect(extractSkills("We go to great lengths for our javascripters and expressive people.")).toEqual([]);
  });
});

describe("classifyListing", () => {
  const raw = (over: Partial<RawListing>): RawListing => ({
    source: "greenhouse",
    board: "example",
    sourceId: "1",
    company: "Example",
    title: "Backend Engineer",
    url: "https://example.com/jobs/1",
    location: "Remote - Worldwide",
    description: "Build APIs in Python and Postgres.",
    postedAt: "2026-11-01T10:00:00Z",
    ...over,
  });
  const opts = { firstSeenAt: "2026-11-02T00:00:00.000Z" };

  it("puts a worldwide remote role in the remote family", () => {
    const l = classifyListing(raw({}), opts);
    expect(l?.families).toEqual(["remote"]);
    expect(l?.id).toBe("greenhouse:example:1");
    expect(l?.field).toBe("software-engineering");
    expect(l?.skills).toEqual(expect.arrayContaining(["python", "postgres"]));
  });

  it("puts a Gulf office role in the gulf family, and in relocate when it sponsors", () => {
    expect(classifyListing(raw({ location: "Dubai, UAE" }), opts)?.families).toEqual(["gulf"]);
    expect(classifyListing(raw({ location: "Riyadh", description: "Visa sponsorship is available. Relocation package provided." }), opts)?.families).toEqual(["relocate", "gulf"]);
  });

  it("drops an office role that offers nothing to someone abroad", () => {
    expect(classifyListing(raw({ location: "Austin, TX" }), opts)).toBeNull();
    expect(classifyListing(raw({ location: "London", description: "We are unable to sponsor visas." }), opts)).toBeNull();
  });

  it("carries an office role whose employer is a licensed sponsor there", () => {
    expect(classifyListing(raw({ location: "London, UK" }), { ...opts, licensedSponsor: ["GB"] })?.families).toEqual(["relocate"]);
    expect(classifyListing(raw({ location: "Berlin, Germany" }), { ...opts, licensedSponsor: ["GB"] })).toBeNull();
  });

  it("drops a listing without an https link", () => {
    expect(classifyListing(raw({ url: "http://example.com/jobs/1" }), opts)).toBeNull();
  });

  it("never lists a refused visa under relocate", () => {
    const remote = remoteScope("Remote (US)", "");
    expect(feedFamilies({ remote, sponsorship: { visa: "refused", relocation: "offered", evidence: null }, licensedSponsor: [] })).toEqual(["remote"]);
  });
});

describe("wordings found by the end-to-end fixtures", () => {
  it("reads a bare Node as the node skill", () => {
    expect(extractSkills("Must have: Postgres, TypeScript, Node, Docker.")).toContain("node");
    expect(extractSkills("We run many Kubernetes nodes.")).not.toContain("node");
  });

  it("reads open worldwide as anywhere", () => {
    const scope = remoteScope("Remote", "A fully remote role open worldwide. You will keep our services running.", {});
    expect(scope.allowed).toEqual(["WORLD"]);
    expect(scope.confidence).toBe("likely");
  });
});

describe("sponsorship for a named country", () => {
  it("keeps the country an offer is limited to", () => {
    const s = sponsorship("We can sponsor visas to Germany; for any other country, you need to have existing right to work.");
    expect(s.visa).toBe("offered");
    expect(s.countries).toEqual(["DE"]);
  });

  it("ignores countries named after a but", () => {
    const s = sponsorship("We offer visa sponsorship for the Netherlands, but not for roles in the United States.");
    expect(s.countries).toEqual(["NL"]);
  });

  it("names no country when the offer names none", () => {
    expect(sponsorship("Visa sponsorship is available for the right candidate.").countries).toEqual([]);
  });

  it("does not file a role under relocate when the offer is for another country", () => {
    const remote = { mode: "onsite" as const, allowed: [], excluded: [], countries: ["FR"], confidence: "stated" as const, evidence: "Paris, France" };
    const offer = { visa: "offered" as const, relocation: "unknown" as const, evidence: "We can sponsor visas to Germany.", countries: ["DE"] };
    expect(feedFamilies({ remote, sponsorship: offer, licensedSponsor: [] })).not.toContain("relocate");
    expect(feedFamilies({ remote: { ...remote, countries: ["DE"] }, sponsorship: offer, licensedSponsor: [] })).toContain("relocate");
  });
});

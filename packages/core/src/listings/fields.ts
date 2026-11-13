import { CAREER_FIELDS, type CareerFieldId } from "../preferences.js";

/**
 * Sorts a job title into one of the sixteen career fields. The first rule
 * that matches wins, so the order is the logic: specific titles that contain
 * a generic word ("sales engineer", "product designer") come before the
 * generic rule they would otherwise fall into.
 */
const RULES: [CareerFieldId, RegExp][] = [
  ["security", /\b(security|csirt|infosec|appsec|devsecops|penetration|pentest|soc analyst|threat|vulnerability|cyber\w*|grc|red team|incident response)\b/],
  ["sales", /\b(sales|solutions?|pre-?sales) (engineer|architect|consultant)\b/],
  ["customer-support", /\b(support|customer success|customer|technical support) (engineer|specialist|agent|representative|associate|advocate|manager|lead)\b|\b(help ?desk|customer (service|care|experience|support|success)|technical support)\b/],
  ["qa-testing", /\b(qa|quality assurance|quality engineer|sdet|test (engineer|analyst|lead|automation|manager)|tester|testing|automation engineer)\b/],
  ["data-ai", /\b(data (scientist|engineer|analyst|architect|science|engineering|analytics)|machine learning|ml (engineer|ops|scientist|researcher)|mlops|ai (engineer|researcher|scientist)|artificial intelligence|analytics (engineer|manager|lead)|business intelligence|bi (developer|analyst|engineer)|research scientist|applied scientist|nlp|computer vision|deep learning|llm|statistician|quantitative)\b/],
  ["devops-cloud", /\b(devops|sre|site reliability|platform engineer\w*|infrastructure (engineer\w*|architect|lead|manager|operations|developer)|cloud (engineer|architect|operations)|kubernetes|systems? (engineer|administrator)|sysadmin|network (engineer|administrator)|release engineer|build engineer|reliability engineer|database administrator|dba)\b/],
  ["design", /\b(designer|design (lead|manager|director|engineer)|ux|ui\/ux|ui|user experience|user research\w*|creative director|art director|illustrator|motion graphics|animator|head of design)\b/],
  ["writing", /\b(writer|copywriter|editor|technical writ\w+|documentation|content (strategist|writer|editor|designer)|journalist|translator|localization|proofreader)\b/],
  ["product", /\b(product (manager|owner|lead|director|analyst|management|operations|strategist)|(head|director|vp|svp|evp),? (of )?product|chief product|group product|technical product)\b/],
  ["hr-recruiting", /\b(recruit\w*|talent (acquisition|partner|sourcer|manager|lead)|sourcer|people (ops|operations|partner|team|manager|business)|human resources|hr|hrbp|compensation|benefits|learning (and|&) development|employee experience)\b/],
  ["finance", /\b(financ\w+|account(ant|ing)|accounts (payable|receivable)|controller|fp&a|payroll|tax|treasury|audit\w*|bookkeep\w*|cfo|billing|actuar\w+|credit (analyst|risk)|investment|underwrit\w+)\b/],
  ["marketing", /\b(marketing|marketer|growth|seo|sem|ppc|paid (media|social|search)|social media|brand|demand gen\w*|communications|public relations|pr (manager|specialist)|community (manager|lead)|lifecycle|crm (manager|specialist)|content marketing|events? (manager|coordinator)|influencer)\b/],
  ["sales", /\b(sales|accounts? (executive|manager|director)|account development|development representative|business development|bdr|sdr|partnerships?|partner (development|manager|sales|specializations?)|alliances|renewals?|gtm|go[- ]to[- ]market|revenue|channel (manager|sales)|commercial (manager|director)|key accounts?)\b/],
  ["consulting-strategy", /\b(consultant|consulting|strategy|strategist|strategic|advisory|advisor|business analyst|management consult\w+|transformation)\b/],
  ["software-engineering", /\b(software|developer|engineer\w*|programmer|front[- ]?end|back[- ]?end|full[- ]?stack|ios|android|mobile|web|architect|firmware|embedded|golang|java|javascript|typescript|python|node|react|ruby|rails|rust|php|\.net|c\+\+|scala|kotlin|swift|cto|tech(nical)? lead|blockchain|game ?play)\b/],
  ["operations", /\b(operations|ops|logistics|supply chain|procurement|office manager|executive assistant|administrative|admin|project (manager|coordinator|lead)|program (manager|coordinator|lead)|chief of staff|facilities|scrum master|delivery manager|coordinator|virtual assistant)\b/],
];

export function classifyField(title: string): CareerFieldId {
  const t = title.toLowerCase();
  for (const [field, re] of RULES) if (re.test(t)) return field;
  return "other";
}

const TECH = new Set<string>(CAREER_FIELDS.filter((f) => f.tech).map((f) => f.id));

export function isTech(field: string): boolean {
  return TECH.has(field);
}

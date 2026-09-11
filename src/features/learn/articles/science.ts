import type { Article } from '../library';

export const SCIENCE_ARTICLES: Article[] = [
  {
    slug: 'science-what-dht-does-to-a-follicle',
    title: "What DHT is and what it does to a follicle",
    category: 'science',
    standfirst:
      "Dihydrotestosterone is the hormone most closely linked to pattern hair loss, but the story is about local sensitivity as much as hormone levels.",
    readingMinutes: 5,
    updated: '2026-09-11',
    keyTakeaways: [
      "DHT is made from testosterone by an enzyme called 5-alpha reductase",
      "It binds androgen receptors more tightly than testosterone does",
      "In susceptible scalp follicles it is linked to a shorter growth phase and smaller hairs",
      "The same hormone encourages beard and body hair, a contrast researchers call a paradox",
    ],
    sections: [
      {
        heading: 'Where DHT comes from',
        body: "Dihydrotestosterone, usually shortened to DHT, is an androgen produced when the enzyme 5-alpha reductase modifies testosterone. Two main forms of the enzyme exist. Reviews describe the type found mainly in sebaceous glands and skin, and a second type that predominates in hair follicles and is thought to matter more for pattern hair loss. Once formed, DHT attaches to androgen receptors inside cells, and studies report that it binds them several times more strongly than testosterone and lets go more slowly. That stronger, longer signal is one reason researchers focus on DHT rather than testosterone itself.",
      },
      {
        heading: 'Miniaturisation, step by step',
        body: "In people with androgenetic alopecia, the growing phase of affected follicles is commonly observed to shorten, from a span measured in years to one that may last only months. Each cycle then produces a hair that is a little shorter and finer than the one before. Over many cycles, a thick terminal hair can be replaced by a wispy, lightly pigmented one. This gradual shrinking is called miniaturisation. It happens follicle by follicle rather than all at once, which is part of why the process is usually slow and uneven across the scalp.",
      },
      {
        heading: 'Sensitivity, not just quantity',
        body: "Blood levels of androgens in many people with pattern hair loss fall within the typical range. Clinical reviews describe balding scalp areas as having more DHT production, more enzyme activity and more androgen receptors than non-balding areas, which suggests local sensitivity plays a large role. The same hormone that shrinks some scalp follicles helps beard and chest hair grow thicker. Researchers call this the androgen paradox, and it points to follicles in different body regions being programmed to respond to identical signals in opposite ways.",
      },
      {
        heading: 'What is still uncertain',
        body: "The DHT model explains a great deal of male pattern hair loss, but not everything. In women, the role of androgens is considered less straightforward; some have signs of hormone excess, such as those associated with polycystic ovary syndrome, while many do not. Researchers also continue to study why follicles in the same region miniaturise at different rates. Anyone concerned about hormone-related hair changes is best served by a qualified healthcare professional, who can consider the full clinical picture.",
      },
    ],
    references: [
      'NCBI Bookshelf (StatPearls) — Androgenetic Alopecia. https://www.ncbi.nlm.nih.gov/books/NBK430924/',
      'Owecka et al., 2024 — The Hormonal Background of Hair Loss in Non-Scarring Alopecias. https://pmc.ncbi.nlm.nih.gov/articles/PMC10968111/',
      'DermNet — Male pattern hair loss (androgenetic alopecia). https://dermnetnz.org/topics/male-pattern-hair-loss',
    ],
  },
  {
    slug: 'science-androgen-receptors-and-inherited-risk',
    title: "Androgen receptors and the genetics of pattern hair loss",
    category: 'science',
    standfirst:
      "Pattern hair loss runs strongly in families, yet no single gene decides it, and genetic tests cannot yet predict it reliably for an individual.",
    readingMinutes: 5,
    updated: '2026-09-11',
    keyTakeaways: [
      "The androgen receptor gene sits on the X chromosome and shows the strongest known link",
      "Many other genes, inherited from both parents, also contribute",
      "Known genetic markers explain only part of the inherited risk",
      "Population-level associations do not translate into individual predictions",
    ],
    sections: [
      {
        heading: 'A highly heritable trait',
        body: "Pattern hair loss is one of the most heritable common traits studied in dermatology. Clinical reviews note that sons of fathers with balding have a several-fold higher relative risk than sons of fathers without it. Researchers describe the condition as polygenic, meaning many genes each nudge the risk up or down rather than one gene switching it on. Genes appear to influence the age it begins, how quickly it progresses and what pattern it takes, which helps explain why brothers can follow quite different paths.",
      },
      {
        heading: 'The androgen receptor gene',
        body: "The first gene firmly tied to pattern hair loss was the one that encodes the androgen receptor, the protein DHT binds to inside follicle cells. It lies on the X chromosome, which men inherit from their mothers, so the maternal side of the family matters more than folklore sometimes allows. In a large 2012 analysis pooling seven genome-wide studies and nearly 13,000 people of European ancestry, variation near this gene showed the strongest association of any region examined. Researchers think such variants may change how sensitive follicles are to androgens.",
      },
      {
        heading: 'Many genes, partial answers',
        body: "The same 2012 analysis confirmed a second region on chromosome 20 and identified six additional regions elsewhere in the genome. Combining these markers into a score separated people into groups with noticeably different average risk. Even so, the known markers account for only a portion of the heritability, and later studies have kept adding more. Some regions also turned up in studies of unrelated conditions, which researchers treat as clues about shared biology rather than as a forecast for any one person.",
      },
      {
        heading: 'Why a test cannot tell your future yet',
        body: "Genetic associations describe averages across thousands of people. A variant that raises risk modestly in a population says little about when, or whether, a particular follicle will miniaturise. Clinical sources currently describe predictive genetic testing for pattern hair loss as unreliable. Ancestry also matters, because most large studies have focused on people of European descent. Anyone curious about their family history and what it may mean is best advised to discuss it with a qualified healthcare professional.",
      },
    ],
    references: [
      'Li et al., 2012 — Six Novel Susceptibility Loci for Early-Onset Androgenetic Alopecia and Their Unexpected Association with Common Diseases. https://pmc.ncbi.nlm.nih.gov/articles/PMC3364959/',
      'NCBI Bookshelf (StatPearls) — Androgenetic Alopecia. https://www.ncbi.nlm.nih.gov/books/NBK430924/',
      'DermNet — Male pattern hair loss (androgenetic alopecia). https://dermnetnz.org/topics/male-pattern-hair-loss',
    ],
  },
  {
    slug: 'science-hair-follicle-stem-cells',
    title: "Hair follicle stem cells and the bulge",
    category: 'science',
    standfirst:
      "Each follicle keeps a small reserve of stem cells, and research suggests that in pattern hair loss this reserve is often still present.",
    readingMinutes: 5,
    updated: '2026-09-11',
    keyTakeaways: [
      "Follicle stem cells live in a region called the bulge",
      "They wake at the start of each growth phase and feed a new hair",
      "One key study found stem cells retained in bald scalp, but fewer activated progenitors",
      "Retained stem cells are a research clue, not evidence of an available fix",
    ],
    sections: [
      {
        heading: 'A reservoir that restarts growth',
        body: "Partway down each follicle sits a region called the bulge. It holds a pool of small, mostly quiet stem cells. At the start of every new growth phase, some of these cells become active and give rise to faster-dividing progenitor cells, which in turn build the lower follicle and the new hair shaft. Because this reservoir survives from cycle to cycle, a follicle can regrow a hair many times over a lifetime. Damage to the bulge itself is associated with the permanent, scarring types of hair loss.",
      },
      {
        heading: 'What bald scalp still contains',
        body: "A frequently cited 2011 study compared samples of balding and non-balding scalp from the same men with pattern hair loss. The researchers found that the stem cells in the bulge were present in roughly normal numbers in bald areas. What was sharply reduced were two populations of progenitor cells, the next step down the line. The authors interpreted this as a problem with activating stem cells, or converting them into working progenitors, rather than a loss of the stem cells themselves.",
      },
      {
        heading: 'Why that finding matters',
        body: "If the stem cells remain, pattern hair loss is not a case of the raw material being gone. This fits with it being classed as a non-scarring condition. It also explains why research groups are interested in signals that might coax dormant stem cells back into action. Studies in this area are ongoing, and the gap between identifying a stalled step in a tissue sample and safely restarting it in people is large.",
      },
      {
        heading: 'Reading the claims carefully',
        body: "Much stem cell biology was first worked out in mice, and reviews point out that the markers used to identify mouse bulge stem cells do not map neatly onto human ones. Findings from one study group, one ethnic background or one stage of hair loss may not hold everywhere, and long-standing bald areas may differ from recently thinning ones. Marketing that promises to 'activate stem cells' usually runs well ahead of this evidence. Questions about personal options belong with a qualified healthcare professional.",
      },
    ],
    references: [
      'Garza et al., 2011 (Journal of Clinical Investigation) — Bald scalp in men with androgenetic alopecia retains hair follicle stem cells but lacks CD200-rich and CD34-positive hair follicle progenitor cells. https://www.jci.org/articles/view/44478',
      'Castro, Portinha and Logarinho, 2022 — The Emergent Power of Human Cellular vs Mouse Models in Translational Hair Research. https://pmc.ncbi.nlm.nih.gov/articles/PMC9585950/',
      'Ramos, Guerrero-Juarez and Plikus, 2013 — Hair Follicle Signaling Networks: a Dermal Papilla Centric Approach. https://pmc.ncbi.nlm.nih.gov/articles/PMC4094135/',
    ],
  },
  {
    slug: 'science-dermal-papilla-signalling-hub',
    title: "The dermal papilla, the follicle's signalling hub",
    category: 'science',
    standfirst:
      "A small cluster of cells at the base of each follicle sends the instructions that shape how big a hair grows and when it grows.",
    readingMinutes: 5,
    updated: '2026-09-11',
    keyTakeaways: [
      "The dermal papilla sits at the follicle base and directs the cells that build hair",
      "In mice, the number of papilla cells tracks with how thick a hair is",
      "Androgen receptors in these cells are central to pattern hair loss",
      "Papilla cells lose much of their identity when grown in a dish",
    ],
    sections: [
      {
        heading: 'A tiny control centre',
        body: "At the very bottom of each growing follicle is the dermal papilla, a compact group of specialised connective-tissue cells cupped by the hair bulb. The papilla does not make hair itself. Instead, researchers describe it as a signalling niche: it releases molecular messages that tell neighbouring progenitor cells to divide, move upward and mature into the layers of the hair shaft. Signalling families known as Wnt and BMP feature heavily in this conversation, alongside many other factors that are still being mapped.",
      },
      {
        heading: 'Size of the papilla, size of the hair',
        body: "A 2013 mouse study found that follicles producing different hair types contained different numbers of papilla cells, and that experimentally reducing those cells led to thinner, smaller hairs. When the count fell below a certain threshold, follicles stayed stuck in their resting phase. Follicles just above that threshold were able to restart growth and rebuild their papilla. These results come from mice, but they fit the broader idea that the papilla helps set both hair calibre and the ability to cycle.",
      },
      {
        heading: 'Where androgens act',
        body: "In human scalp, androgen receptors in dermal papilla cells are thought to be where DHT exerts much of its effect. Reviews describe the defect in pattern hair loss as sitting largely in the papilla's signalling rather than in a shortage of stem cells. In other words, the instructions change before the builders run out. Why papilla cells in some scalp regions respond by shrinking the follicle, while those in the beard respond by enlarging it, remains an active question.",
      },
      {
        heading: 'The culture problem',
        body: "Researchers have long hoped to grow a person's papilla cells in large numbers and use them to form new follicles. One obstacle is striking: once removed and grown in a dish, papilla cells quickly lose most of the gene activity that made them special, along with much of their ability to induce hair. Growing them as small three-dimensional clusters restores some properties but not all. This is why progress in this area tends to be measured in careful laboratory steps rather than clinic-ready treatments.",
      },
    ],
    references: [
      'Ramos, Guerrero-Juarez and Plikus, 2013 — Hair Follicle Signaling Networks: a Dermal Papilla Centric Approach. https://pmc.ncbi.nlm.nih.gov/articles/PMC4094135/',
      'Chi, Wu and Morgan, 2013 (Development) — Dermal papilla cell number specifies hair size, shape and cycling and its reduction causes follicular decline. https://journals.biologists.com/dev/article/140/8/1676/46012/Dermal-papilla-cell-number-specifies-hair-size',
      'Ben Hamida et al., 2024 — Hair Regeneration Methods Using Cells Derived from Human Hair Follicles and Challenges to Overcome. https://pmc.ncbi.nlm.nih.gov/articles/PMC11720663/',
    ],
  },
  {
    slug: 'science-how-trials-measure-hair',
    title: "How clinical trials measure hair",
    category: 'science',
    standfirst:
      "Hair studies rely on a handful of measurement methods, each with its own strengths, blind spots and room for error.",
    readingMinutes: 6,
    updated: '2026-09-11',
    keyTakeaways: [
      "Target area hair counts track a small, marked patch of scalp over time",
      "Standardised global photographs capture the overall look, judged by assessors",
      "Self-assessment questionnaires reflect perception and correlate only modestly with counts",
      "Different methods across trials make results hard to compare directly",
    ],
    sections: [
      {
        heading: 'Counting hairs in a small patch',
        body: "The workhorse of many hair trials is the target area hair count. Researchers mark a small patch of scalp, sometimes with a tiny tattoo so it can be found again, clip the hairs short and take magnified photographs. Repeating the process after a short gap shows which hairs have lengthened and are therefore growing. The method, known as a phototrichogram, can estimate density, thickness and growth rate, and many trials separate thicker terminal hairs from fine vellus ones. Software-assisted versions speed the analysis, but the approach remains labour-intensive and needs trained staff.",
      },
      {
        heading: 'Global photographs',
        body: "Counts in one square centimetre cannot show how a whole scalp looks. For that, trials take standardised photographs from fixed angles with controlled lighting, head position and hairstyle. Panels of assessors, ideally unaware of which group each participant belongs to, then compare before-and-after images and rate them on a simple scale from worse to better. Reviews of hair evaluation methods rank standardised global photography and phototrichogram-based techniques among the most useful tools available, particularly when used together.",
      },
      {
        heading: 'Questionnaires and invasive methods',
        body: "Participants are often asked whether they think their hair has improved. These answers matter to people but are subjective, and reviews note they line up only modestly with objective counts. At the other end of the spectrum, plucking hairs to examine their roots, or taking a small scalp biopsy, gives detailed information about cycle stage and follicle structure. Those approaches are painful or invasive, and a single small sample may not represent the whole scalp, so they are used more for diagnosis than for routine trial tracking.",
      },
      {
        heading: 'Why methods matter when comparing studies',
        body: "A 2023 network meta-analysis of hair regrowth trials noted inconsistent hair-counting methods and gaps in how errors were reported across the literature. When one study counts in a slightly different location, uses a different hair-thickness cut-off or relies mostly on self-rating, its numbers cannot simply be placed side by side with another's. Knowing which measure a headline figure comes from is often the quickest way to judge how much weight it can bear.",
      },
    ],
    references: [
      'Dhurat and Saraogi, 2009 — Hair Evaluation Methods: Merits and Demerits. https://pmc.ncbi.nlm.nih.gov/articles/PMC2938572/',
      'Dhurat, 2006 (Indian Journal of Dermatology, Venereology and Leprology) — Phototrichogram. https://ijdvl.com/phototrichogram/',
      'Feldman et al., 2023 — Hair regrowth treatment efficacy and resistance in androgenetic alopecia: A systematic review and continuous Bayesian network meta-analysis. https://pmc.ncbi.nlm.nih.gov/articles/PMC9900126/',
    ],
  },
  {
    slug: 'science-placebo-responses-in-hair-studies',
    title: "Placebo responses in hair-loss research",
    category: 'science',
    standfirst:
      "People given an inactive treatment in hair trials sometimes appear to improve, which is exactly why a comparison group is essential.",
    readingMinutes: 5,
    updated: '2026-09-11',
    keyTakeaways: [
      "Placebo groups in hair trials do not always stay flat",
      "Expectation, measurement noise and natural fluctuation all contribute",
      "Only a comparison with a placebo group shows what a treatment itself adds",
      "Subjective ratings are especially open to expectation effects",
    ],
    sections: [
      {
        heading: 'What a placebo response is',
        body: "A placebo response is an improvement that follows from receiving an inactive treatment, often linked to a person's expectation of benefit and the care that surrounds a study. The US National Center for Complementary and Integrative Health describes placebo-controlled, randomised trials as the gold standard for testing whether an intervention works, because they let researchers separate the effect of the treatment from everything else that happens to participants during a study.",
      },
      {
        heading: 'Placebo groups in hair trials',
        body: "Hair trials offer clear examples. In one randomised, double-blind trial of 76 men followed for 24 weeks, the placebo group's average hair count rose by about ten percent, even though most of its members were rated as unchanged and roughly a quarter worsened. An average can move for many reasons, and a few individuals with large swings can pull it up. Without the placebo arm, part of any improvement in the treated group could easily have been misattributed.",
      },
      {
        heading: 'Why inactive treatments seem to work',
        body: "Several forces are commonly at play. Hair counts vary naturally from visit to visit, and small shifts in where a target area is photographed can change the number. People often join trials when their hair loss seems worst, so some drift back toward their usual state regardless of treatment, a statistical pattern called regression to the mean. Taking part in a study can also change habits, such as gentler styling, that affect how hair looks. Self-ratings are particularly sensitive to hope and attention.",
      },
      {
        heading: 'Reading placebo results',
        body: "The meaningful figure in a trial is the difference between treated and placebo groups, not the treated group's change on its own. Claims based on before-and-after results without any comparison group cannot distinguish a real effect from the forces above. When a study reports only self-assessed improvement, the placebo response can be large enough to swamp a modest true effect. Questions about how a specific study applies to an individual are best taken to a qualified healthcare professional.",
      },
    ],
    references: [
      'National Center for Complementary and Integrative Health (NIH) — Placebo Effect. https://www.nccih.nih.gov/health/placebo-effect',
      'Cho et al., 2014 — Effect of Pumpkin Seed Oil on Hair Growth in Men with Androgenetic Alopecia: A Randomized, Double-Blind, Placebo-Controlled Trial. https://pmc.ncbi.nlm.nih.gov/articles/PMC4017725/',
      'Feldman et al., 2023 — Hair regrowth treatment efficacy and resistance in androgenetic alopecia: A systematic review and continuous Bayesian network meta-analysis. https://pmc.ncbi.nlm.nih.gov/articles/PMC9900126/',
    ],
  },
  {
    slug: 'science-how-to-read-a-hair-loss-study',
    title: "How to read a hair-loss study",
    category: 'science',
    standfirst:
      "A few questions about who was studied, for how long and against what comparison reveal most of what a hair study can and cannot show.",
    readingMinutes: 6,
    updated: '2026-09-11',
    keyTakeaways: [
      "Check whether the study involved people, animals or cells in a dish",
      "Small samples and short follow-up make results fragile",
      "Randomisation, blinding and a control group guard against wishful thinking",
      "Statistically significant does not always mean noticeable",
    ],
    sections: [
      {
        heading: 'Who and what was studied',
        body: "The first question is whether the research involved people at all. Many exciting findings come from cells in a dish or from mice, and those stages are a long way from human evidence. For human studies, the number of participants matters: a trial of a few dozen people can produce a striking result that shrinks or vanishes in a larger group. It also helps to note who took part, including sex, age, ancestry and the type and stage of hair loss, since results may not carry across.",
      },
      {
        heading: 'Comparison, randomisation and blinding',
        body: "A well-designed trial compares a treated group with a control group, commonly given a placebo, and assigns people to each group at random. Blinding, where neither participants nor assessors know who received what, protects against expectation colouring the results. Studies that report only before-and-after changes in a single group are much weaker, because hair counts drift and people's perceptions shift for reasons unrelated to any treatment.",
      },
      {
        heading: 'Duration and hair biology',
        body: "Because follicles cycle slowly, changes in hair take months to appear and further months to settle. Many regrowth trials report outcomes at around 12 and 24 weeks, and a 2023 network meta-analysis observed that some early gains appeared to level off with time. Studies lasting only a few weeks may capture shedding shifts or cosmetic effects on the hair shaft rather than lasting follicle change. Long-term data, where they exist, are often the most informative part of the evidence.",
      },
      {
        heading: 'Size of effect and who paid',
        body: "A result can be statistically significant yet too small for anyone to notice in the mirror; US Federal Trade Commission guidance makes the same distinction between statistical and clinically meaningful benefit. Percentage changes from small target areas can sound larger than they look. Funding and conflicts of interest are worth noting too. The same meta-analysis found that only a tiny fraction of the thousands of screened studies met its quality criteria. How any study relates to one person is a conversation for a qualified healthcare professional.",
      },
    ],
    references: [
      'MedlinePlus (US National Library of Medicine) — Evaluating Health Information. https://medlineplus.gov/evaluatinghealthinformation.html',
      'Feldman et al., 2023 — Hair regrowth treatment efficacy and resistance in androgenetic alopecia: A systematic review and continuous Bayesian network meta-analysis. https://pmc.ncbi.nlm.nih.gov/articles/PMC9900126/',
      'US Federal Trade Commission — Health Products Compliance Guidance. https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance',
    ],
  },
  {
    slug: 'science-mouse-studies-are-not-human-results',
    title: "Why mouse studies do not equal human results",
    category: 'science',
    standfirst:
      "Mice are indispensable for hair biology, but their follicles behave so differently from ours that a result in mice is only an early clue.",
    readingMinutes: 5,
    updated: '2026-09-11',
    keyTakeaways: [
      "A mouse growth phase lasts weeks; a human scalp growth phase lasts years",
      "Mouse hair tends to cycle in waves, while human scalp follicles cycle independently",
      "Mice do not develop androgen-driven pattern baldness",
      "Human tissue models are improving but still have limits",
    ],
    sections: [
      {
        heading: 'Different clocks',
        body: "A mouse follicle's growth phase lasts roughly two to three weeks. A human scalp follicle's growth phase commonly lasts several years. Mouse hair also tends to cycle in coordinated waves across large patches of skin, whereas human scalp follicles each run on their own schedule. A compound that pushes a resting mouse follicle into growth within days is acting on a very different system from a human scalp that turns over hair slowly and unevenly.",
      },
      {
        heading: 'Different hair and different cells',
        body: "Mice grow several distinct hair types across their bodies, while the human scalp mainly has thick terminal hairs and fine vellus hairs. Reviews also note that the markers used to identify stem cells in mouse follicles do not reliably identify their human counterparts, and that some features of the mouse hair cycle are not seen in people. Findings about a particular cell type in mice may therefore point to a slightly different population, or none, in human skin.",
      },
      {
        heading: 'The missing condition',
        body: "Perhaps the most important difference is that androgens do not cause pattern baldness in standard mouse models the way they do in susceptible humans. Human follicles also respond to hormones such as oestrogen and prolactin in ways mice do not replicate. That makes it hard to study androgenetic alopecia directly in mice, and a treatment that speeds hair growth in a shaved mouse is not necessarily addressing the process that causes thinning in people.",
      },
      {
        heading: 'Better models, and reading the headlines',
        body: "Researchers increasingly use human-based systems: scalp follicles kept alive in culture, three-dimensional clusters of papilla cells, human skin grafted onto immunodeficient mice, and lab-grown skin organoids that can sprout hair for a few months. Each has limits, and none fully reproduces living scalp. When a headline says a treatment regrew hair, it is worth checking which species, or which dish, the result came from. Most mouse findings never progress to proven human treatments.",
      },
    ],
    references: [
      'Castro, Portinha and Logarinho, 2022 — The Emergent Power of Human Cellular vs Mouse Models in Translational Hair Research. https://pmc.ncbi.nlm.nih.gov/articles/PMC9585950/',
      'Tan, Lim and Lay, 2024 — Modelling Human Hair Follicles: Lessons from Animal Models and Beyond. https://pmc.ncbi.nlm.nih.gov/articles/PMC11117913/',
      'MedlinePlus (US National Library of Medicine) — Evaluating Health Information. https://medlineplus.gov/evaluatinghealthinformation.html',
    ],
  },
  {
    slug: 'science-research-frontiers-and-realistic-timelines',
    title: "Follicle cloning, Wnt and cell therapy: where the frontier really is",
    category: 'science',
    standfirst:
      "Regenerative hair research is genuinely exciting, but most of it is still preclinical, and the remaining hurdles are substantial.",
    readingMinutes: 6,
    updated: '2026-09-11',
    keyTakeaways: [
      "'Hair cloning' usually means multiplying a person's own follicle cells in the lab",
      "Cultured cells tend to lose their hair-inducing ability",
      "Wnt signalling drives growth but is also linked to cancer when overactive",
      "Most approaches remain experimental, with no firm dates for clinical use",
    ],
    sections: [
      {
        heading: "What 'cloning' usually means",
        body: "Popular coverage often calls it hair cloning, but researchers usually mean something narrower: taking a small number of cells from a person's existing follicles, multiplying them in the lab and returning them to form new follicles. A 2024 review of these methods concluded that forming thick, cycling hair follicles from human cells has been difficult to achieve efficiently and reproducibly. It noted that many successes combine human cells with mouse cells, which limits how directly they translate, and that clinically viable treatments do not yet exist.",
      },
      {
        heading: 'The hurdles',
        body: "The central problem is that dermal papilla cells lose much of their hair-inducing capacity once grown in culture. Three-dimensional growth methods help but do not fully restore it, and papilla cells alone are not enough; epithelial cells are also needed, and those are hard to isolate and expand. Beyond making a follicle at all, a usable therapy would need hairs pointing the right way, at the right density, with natural colour and a normal growth cycle, delivered safely and at a realistic cost.",
      },
      {
        heading: 'Wnt signalling',
        body: "The Wnt pathway is one of the main signals that tells resting follicles to start a new growth phase, and many experimental approaches aim to nudge it. A 2025 review listed several candidates, such as peptides and small molecules, most still at the preclinical stage. The same review flagged a serious caution: abnormal, sustained Wnt activation has been associated with several cancers. Researchers describe a narrow window between enough activity to help follicles and too much elsewhere in the body.",
      },
      {
        heading: 'Realistic timelines',
        body: "New medical treatments typically pass through laboratory work, animal testing and several phases of human trials before regulators consider them, and the process commonly takes many years. Some mechanisms have made that journey; drugs that block immune signalling in severe alopecia areata are one example of lab insight becoming an approved therapy. For regenerative approaches, promises of imminent cures are best read as hype. Anyone curious about clinical trials can discuss eligibility with a qualified healthcare professional.",
      },
    ],
    references: [
      'Ben Hamida et al., 2024 — Hair Regeneration Methods Using Cells Derived from Human Hair Follicles and Challenges to Overcome. https://pmc.ncbi.nlm.nih.gov/articles/PMC11720663/',
      'Mehta et al., 2025 — Revolutionary Approaches to Hair Regrowth: Follicle Neogenesis, Wnt/ß-Catenin Signaling, and Emerging Therapies. https://pmc.ncbi.nlm.nih.gov/articles/PMC12153676/',
      'Ramos, Guerrero-Juarez and Plikus, 2013 — Hair Follicle Signaling Networks: a Dermal Papilla Centric Approach. https://pmc.ncbi.nlm.nih.gov/articles/PMC4094135/',
    ],
  },
  {
    slug: 'science-immune-privilege-and-alopecia-areata',
    title: "Immune privilege and alopecia areata",
    category: 'science',
    standfirst:
      "Growing follicles normally hide from the immune system; alopecia areata is thought to begin when that protection breaks down.",
    readingMinutes: 5,
    updated: '2026-09-11',
    keyTakeaways: [
      "Growing follicles keep a low profile with the immune system, called immune privilege",
      "In alopecia areata, inflammatory signals are thought to strip that protection away",
      "Immune cells then attack the growing base of the follicle",
      "The stem cell region is usually spared, which is why regrowth remains possible",
    ],
    sections: [
      {
        heading: 'A protected zone',
        body: "The immune system constantly checks tissues for signs of trouble. Growing hair follicles are an exception: their lower portion keeps a deliberately low profile. Reviews describe this state, called immune privilege, as relying on reduced display of the molecules that present proteins to immune cells, few nearby immune cells and locally produced calming signals. Researchers think this protection lets the follicle rebuild itself each growth phase without drawing an immune attack.",
      },
      {
        heading: 'When the protection collapses',
        body: "Alopecia areata is an autoimmune condition, and a leading explanation is that immune privilege collapses. Inflammatory messengers, especially one called interferon-gamma, are thought to increase the follicle's display of those presenting molecules, exposing proteins that were previously hidden. Cytotoxic T cells and other immune cells then gather around the base of growing follicles, pushing them abruptly out of their growth phase. What sets off the collapse in a given person is not well understood, although infections and genetic background have both been studied.",
      },
      {
        heading: 'Why hair can come back',
        body: "The attack targets the lower, growing part of the follicle. The bulge region with its stem cells is generally spared, so alopecia areata is classed as non-scarring and follicles keep the capacity to regrow. The US National Institute of Arthritis and Musculoskeletal and Skin Diseases notes that the course is unpredictable: some people have one episode, others have repeated ones. Clinical sources also observe that regrowing hair may first appear white or finer than before.",
      },
      {
        heading: 'From mechanism to medicine',
        body: "Understanding the immune pathway has had practical consequences. Signalling within these immune cells runs partly through a system called JAK-STAT, and drugs that interrupt it have been studied and approved by regulators for some people with severe disease. They are not suitable for everyone and carry their own risks. Alopecia areata can look like other forms of hair loss, so diagnosis and any treatment decisions belong with a board-certified dermatologist or other qualified healthcare professional.",
      },
    ],
    references: [
      'Żeberkiewicz, Rudnicka and Malejczyk, 2020 — Immunology of alopecia areata. https://pmc.ncbi.nlm.nih.gov/articles/PMC7789996/',
      'National Institute of Arthritis and Musculoskeletal and Skin Diseases (NIH) — Alopecia Areata. https://www.niams.nih.gov/health-topics/alopecia-areata',
      'American Academy of Dermatology — Alopecia areata. https://www.aad.org/public/diseases/hair-loss/types/alopecia',
    ],
  },
  {
    slug: 'science-what-clinically-proven-usually-means',
    title: "What 'clinically proven' usually means",
    category: 'science',
    standfirst:
      "The phrase sounds definitive, but the study behind it can range from a rigorous trial to a small, short test measuring something quite different.",
    readingMinutes: 5,
    updated: '2026-09-11',
    keyTakeaways: [
      "In the US, claiming a level of proof requires evidence at that level",
      "'Clinically tested' and 'clinically proven' are not the same claim",
      "The study may measure appearance or feel rather than follicle change",
      "Evidence about an ingredient is not evidence about a finished product",
    ],
    sections: [
      {
        heading: 'What regulators expect',
        body: "In the United States, the Federal Trade Commission treats statements such as 'clinically proven' or 'studies show' as claims about the evidence itself. Its guidance says a company must actually hold the level of proof it advertises. For health benefits, the agency describes randomised, controlled human trials as the kind of evidence experts would generally require, and it adds that a statistically significant result should also be large enough to matter to consumers. Rules differ between countries, and enforcement usually follows complaints rather than preceding sales.",
      },
      {
        heading: 'Where claims and evidence drift apart',
        body: "In a 2014 case involving skincare marketing, the FTC said that gene-science claims had been supported by research comparing gene activity between age groups, not by tests showing the products themselves did what was promised. That kind of gap is a common pattern: a laboratory finding about an ingredient, a study in cells or a result at a different concentration is presented as if it were proof that a finished product works on people.",
      },
      {
        heading: 'Questions that reveal what was tested',
        body: "Behind many hair marketing claims, researchers and consumer advocates commonly find a small study, a short duration or a sponsor-run test without a placebo group. The outcome may be self-reported, such as hair that 'feels thicker', or a cosmetic change to the hair shaft rather than a change in how follicles grow. 'Clinically tested' may only mean a product was tried on people, not that it succeeded. Asking what was measured, in whom, for how long and against what comparison usually clarifies the claim.",
      },
      {
        heading: 'Keeping perspective',
        body: "A marketing claim is not automatically false, and some products do have solid evidence behind them. The point is that the phrase alone carries little information. US government health guidance flags dramatic language and promises that sound too good to be true as warning signs. Independent reviews, published trials and a conversation with a qualified healthcare professional are more reliable ways to judge whether a claim is relevant to a particular situation.",
      },
    ],
    references: [
      "US Federal Trade Commission — Business guidance blog (June 2014) on substantiating scientific claims in L'Oréal skincare advertising. https://www.ftc.gov/business-guidance/blog/2014/06/ftc-loreal-scientific-claims-need-proof-thats-more-just-skin-deep",
      'US Federal Trade Commission — Health Products Compliance Guidance. https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance',
      'MedlinePlus (US National Library of Medicine) — Evaluating Health Information. https://medlineplus.gov/evaluatinghealthinformation.html',
    ],
  },
];

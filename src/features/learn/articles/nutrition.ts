import type { Article } from '../library';

const ALMOHANNA =
  "Almohanna HM, Ahmed AA, Tsatalis JP, Tosti A — The role of vitamins and minerals in hair loss: a review (Dermatology and Therapy, 2018). https://pmc.ncbi.nlm.nih.gov/articles/PMC6380979/";
const GUO_KATTA =
  "Guo EL, Katta R — Diet and hair loss: effects of nutrient deficiency and supplement use (Dermatology Practical & Conceptual, 2017). https://pmc.ncbi.nlm.nih.gov/articles/PMC5315033/";

export const NUTRITION_ARTICLES: Article[] = [
  {
    slug: 'nutrition-iron-ferritin-and-shedding',
    title: 'Iron, ferritin and hair shedding',
    category: 'nutrition',
    standfirst:
      "Low iron stores are one of the most studied nutritional links to hair loss, but the research is less settled than it is often made to sound.",
    readingMinutes: 4,
    updated: '2026-09-11',
    keyTakeaways: [
      "Ferritin is a blood marker of how much iron the body has in storage.",
      "Studies commonly find lower ferritin in women with non-scarring hair loss, but a clear cause-and-effect link has not been proven.",
      "Ferritin can read high during inflammation, so a single number is interpreted in context.",
      "Iron status is something a clinician confirms with blood tests, not something to guess at.",
    ],
    sections: [
      {
        heading: 'What ferritin actually measures',
        body: "Iron is carried around the body in the blood, but much of it is kept in reserve bound to a protein called ferritin. A ferritin blood test gives an estimate of those reserves. Low stores can exist well before a person becomes anaemic, which is why ferritin often comes up in conversations about hair. The marker has quirks, though. Infection, surgery, liver disease and other sources of inflammation can push ferritin upwards, so a normal-looking result does not always mean stores are healthy. Clinicians usually read it alongside other blood results and a person's history.",
      },
      {
        heading: 'What studies have found',
        body: "A 2021 meta-analysis pooling 36 studies and roughly ten thousand participants reported that women with non-scarring hair loss had, on average, lower ferritin than women without it, and the gap looked wider before menopause. Interestingly, iron-deficiency anaemia itself was not more common in the hair loss groups than in women generally. The authors suggested that higher stores may help, yet they also acknowledged that the literature does not show a clear-cut causal link. Earlier reviews describe the same tension: many dermatologists treat confirmed deficiency, while researchers still debate whether low stores alone drive shedding.",
      },
      {
        heading: 'Why guessing is risky',
        body: "Iron is one of the nutrients where more is not automatically better. Excess iron can build up in the body and cause harm, and some people have conditions that make them absorb it too readily. Reviews on diet and hair loss note that when iron is given for a confirmed deficiency, it is usually monitored with repeat blood tests for exactly this reason. Tiredness, heavy periods, restrictive diets and some digestive conditions are common reasons a clinician may consider testing. Anyone wondering about their iron status is best served by asking a qualified healthcare professional to check it properly.",
      },
    ],
    references: [
      "Treister-Goltzman Y, Yarza S, Peleg R — Iron deficiency and nonscarring alopecia in women: systematic review and meta-analysis (Skin Appendage Disorders, 2021). https://pmc.ncbi.nlm.nih.gov/articles/PMC8928181/",
      "MedlinePlus — Ferritin blood test. https://medlineplus.gov/lab-tests/ferritin-blood-test/",
      GUO_KATTA,
      ALMOHANNA,
    ],
  },
  {
    slug: 'nutrition-vitamin-d-and-hair',
    title: 'What vitamin D research says about hair',
    category: 'nutrition',
    standfirst:
      "Vitamin D plays a part in the hair follicle's growth cycle, and low levels are often reported in people with hair loss, but treatment evidence is still thin.",
    readingMinutes: 4,
    updated: '2026-09-11',
    keyTakeaways: [
      "The vitamin D receptor appears to be involved in starting new hair growth cycles.",
      "Many studies report lower vitamin D levels in people with several types of non-scarring hair loss.",
      "Findings are inconsistent, and few trials have tested whether correcting levels changes hair outcomes.",
      "Vitamin D levels are measured with a blood test and interpreted by a clinician.",
    ],
    sections: [
      {
        heading: 'A role in the follicle',
        body: "Vitamin D is best known for its role in bones, but its receptor is also found in skin and hair follicles. Laboratory and animal research suggests the receptor is needed to start the growth phase of the hair cycle, and that disrupting it disturbs normal follicle cycling. That observation has made researchers curious about whether lower levels of the vitamin might nudge the follicle cycle in a less favourable direction in otherwise healthy people.",
      },
      {
        heading: 'What studies in people show',
        body: "Reviews of the clinical literature report that lower blood levels of vitamin D are commonly found in people with alopecia areata, female pattern hair loss and telogen effluvium. The picture is not tidy, however. Some studies linked lower levels with more severe alopecia areata while others found no relationship, and at least one telogen effluvium study found higher levels in patients. Differences in season of testing, the groups studied and how deficiency was defined may explain some of this. An association also cannot tell us which came first.",
      },
      {
        heading: 'Where the uncertainty sits',
        body: "Authors of these reviews generally agree that correcting a confirmed deficiency is reasonable for overall health, and some suggest checking levels in people with hair loss. What remains unclear is whether raising vitamin D improves hair in a meaningful way. Few trials exist, and those that do are small. A systematic review of nutritional treatments rated the evidence for vitamin D in hair loss as low quality. Because vitamin D is fat-soluble and can accumulate, testing and any treatment decisions sit best with a qualified healthcare professional.",
      },
    ],
    references: [
      "Gerkowicz A, Chyl-Surdacka K, Krasowska D, Chodorowska G — The role of vitamin D in non-scarring alopecia (International Journal of Molecular Sciences, 2017). https://pmc.ncbi.nlm.nih.gov/articles/PMC5751255/",
      ALMOHANNA,
      "Drake L et al. — Evaluation of the safety and effectiveness of nutritional supplements for treating hair loss: a systematic review (JAMA Dermatology, 2023). https://jamanetwork.com/journals/jamadermatology/article-abstract/2798840",
    ],
  },
  {
    slug: 'nutrition-biotin-evidence-and-lab-tests',
    title: 'Biotin: popular, rarely lacking, and a lab-test problem',
    category: 'nutrition',
    standfirst:
      "Biotin is one of the most marketed hair nutrients, yet evidence of benefit in people who are not deficient is close to absent, and it can distort blood tests.",
    readingMinutes: 4,
    updated: '2026-09-11',
    keyTakeaways: [
      "True biotin deficiency is uncommon and usually tied to specific genetic, medical or dietary circumstances.",
      "Published cases of hair improving with biotin almost all involved an underlying condition.",
      "High biotin intake can cause falsely high or falsely low results on some laboratory tests.",
      "Anyone having blood tests is commonly asked to mention any supplements they take.",
    ],
    sections: [
      {
        heading: 'Why biotin became a hair vitamin',
        body: "Biotin, sometimes called vitamin B7, helps enzymes that process fats, carbohydrates and proteins. Severe deficiency can cause hair thinning, and that link is the basis for much of its marketing. Deficiency is rare, though. Reviews describe it mainly in people with inherited enzyme disorders, prolonged malnutrition, certain anticonvulsant medicines, or in some cases pregnancy. For most people eating a varied diet, levels are thought to be adequate. It is also hard to measure directly, as blood levels fluctuate from day to day.",
      },
      {
        heading: 'What the evidence contains',
        body: "A 2017 review searched for every published report of biotin affecting hair or nails and found only eighteen cases. Every one of them involved an underlying problem, such as an inherited enzyme deficiency, a rare hair shaft disorder or medication-related deficiency. No randomised controlled trial showed benefit in healthy people, and the authors concluded that biotin's popularity has run well ahead of the science. Broader reviews of nutrition and hair loss reach a similar view: correcting a real deficiency makes sense, but there is no trial evidence of benefit without one.",
      },
      {
        heading: 'The lab-test interference issue',
        body: "Many common blood tests use a biotin-based chemical step. When a person has taken a lot of biotin, the extra amount in the sample can interfere and produce results that are wrongly high or wrongly low, depending on the test. The US Food and Drug Administration has warned about this, with particular concern for troponin tests used to check for heart attacks, and has noted reports of falsely low troponin results. Thyroid and hormone tests can also be affected. Clinicians and laboratories commonly ask about supplements for this reason, and a qualified healthcare professional can advise on any questions about test timing.",
      },
    ],
    references: [
      "Patel DP, Swink SM, Castelo-Soccio L — A review of the use of biotin for hair loss (Skin Appendage Disorders, 2017). https://pmc.ncbi.nlm.nih.gov/articles/PMC5582478/",
      "US Food and Drug Administration — Biotin interference with troponin lab tests: assays subject to biotin interference. https://www.fda.gov/medical-devices/in-vitro-diagnostics/biotin-interference-troponin-lab-tests-assays-subject-biotin-interference",
      ALMOHANNA,
    ],
  },
  {
    slug: 'nutrition-zinc-and-hair',
    title: 'Zinc and hair: a mixed picture',
    category: 'nutrition',
    standfirst:
      "Zinc deficiency can cause hair loss, but outside of confirmed deficiency the research is inconsistent, and too much zinc brings problems of its own.",
    readingMinutes: 3,
    updated: '2026-09-11',
    keyTakeaways: [
      "Zinc supports cell division and growth, which hair follicles rely on heavily.",
      "Hair loss is a recognised feature of zinc deficiency, and it is often reversible once the deficiency is corrected.",
      "Studies on zinc in common forms of hair loss disagree with one another.",
      "Long-term excess zinc can lower copper and iron levels in the body.",
    ],
    sections: [
      {
        heading: 'Why zinc matters to follicles',
        body: "Zinc is involved in immune function, wound healing and cell division. Hair follicles are among the most rapidly dividing tissues in the body, so it is not surprising that they are sensitive to a shortage. Hair loss is listed among the signs of zinc deficiency, together with frequent infections, poor appetite, changes in taste and smell, skin sores and slow wound healing. Reviews suggest that looking for deficiency makes most sense when there are risk factors, such as a very restricted diet or a condition that affects absorption.",
      },
      {
        heading: 'What studies have and have not shown',
        body: "Reviews describe a genuine link between deficiency and shedding, and some report that hair loss caused by deficiency tends to reverse once zinc is restored. Beyond that, results become patchy. Some studies found lower zinc in people with alopecia areata, while research on pattern hair loss and telogen effluvium has been inconsistent. One major review concluded that routine zinc testing for those common conditions is not supported. Another noted that there is no clear evidence for taking zinc when levels are normal. Measuring zinc accurately is also difficult, which complicates the research.",
      },
      {
        heading: 'The downside of more',
        body: "Taking large amounts of zinc can cause nausea, cramps and diarrhoea in the short term. Over longer periods, excess zinc can interfere with the absorption of copper and iron, potentially creating a different deficiency. Some reviews also mention effects on immune function. Because signs of deficiency overlap with many other conditions, and because excess has real costs, checking zinc status is generally a decision made with a qualified healthcare professional rather than a self-directed experiment.",
      },
    ],
    references: [
      "MedlinePlus — Zinc in diet. https://medlineplus.gov/ency/article/002416.htm",
      ALMOHANNA,
      GUO_KATTA,
    ],
  },
  {
    slug: 'nutrition-protein-and-the-hair-cycle',
    title: 'Protein, energy and the hair cycle',
    category: 'nutrition',
    standfirst:
      "Hair is built from protein and grown by some of the busiest cells in the body, so a shortfall in protein or overall energy can show up as shedding.",
    readingMinutes: 3,
    updated: '2026-09-11',
    keyTakeaways: [
      "Hair shafts are made mostly of keratin, a structural protein.",
      "Low protein intake and sudden calorie restriction are both recognised triggers of temporary shedding.",
      "Shedding usually appears months after the dietary change, not straight away.",
      "Hair is described as regrowing for many people once intake is restored.",
    ],
    sections: [
      {
        heading: 'Why follicles are sensitive',
        body: "Each hair shaft is mostly keratin, a tough protein that follicle cells assemble during the growth phase. Those cells divide very quickly, and growing hair is not essential for survival. When the body is short of protein or energy, it appears to prioritise vital organs and can move more follicles into the resting phase. That is one reason why hair is sometimes described as an early place where nutritional stress becomes visible, even before other signs appear.",
      },
      {
        heading: 'What reviews describe',
        body: "Dermatology reviews list reduced protein intake and rapid weight loss among the known causes of telogen effluvium, a temporary increase in shedding. The American Academy of Dermatology names too little protein, alongside iron, zinc and biotin, as a possible contributor to noticeable hair loss, and notes that hair can regrow once the body receives what it was missing. Because of the lag built into the hair cycle, the shedding tends to appear some months after the change in diet rather than straight away.",
      },
      {
        heading: 'Keeping it in proportion',
        body: "In countries with a varied food supply, frank protein deficiency is uncommon, and there is little evidence that eating more protein than the body needs leads to extra hair. The situations where protein most often comes up are very restrictive diets, illness that affects appetite or absorption, eating disorders, and recovery after weight-loss surgery. In those cases, a qualified healthcare professional or registered dietitian is the right person to assess whether intake is adequate and whether anything else might explain the shedding.",
      },
    ],
    references: [
      GUO_KATTA,
      "American Academy of Dermatology — Hair loss: who gets and causes. https://www.aad.org/public/diseases/hair-loss/causes/18-causes",
    ],
  },
  {
    slug: 'nutrition-rapid-weight-loss-and-delayed-shedding',
    title: 'Rapid weight loss and delayed shedding',
    category: 'nutrition',
    standfirst:
      "Crash diets and sudden weight loss are well-known shedding triggers, and the months-long delay before hair falls often hides the connection.",
    readingMinutes: 4,
    updated: '2026-09-11',
    keyTakeaways: [
      "Significant or sudden weight loss is a recognised trigger of telogen effluvium.",
      "Extra shedding typically starts two to four months after the trigger.",
      "For many people, fullness returns over roughly six to nine months once the trigger has passed.",
      "Ongoing restriction can keep shedding going for longer.",
    ],
    sections: [
      {
        heading: 'How the delay works',
        body: "Most hairs on the scalp are in a long growth phase at any one time. A sudden stress on the body, including a sharp drop in food intake, can push a larger share of follicles into the resting phase all at once. Those resting hairs stay in place for a while and only fall when new growth pushes them out. DermNet describes increased hair fall appearing around two to four months after the triggering event. By then, the diet that started it may be over, which is why people often fail to link the two.",
      },
      {
        heading: 'What counts as a trigger',
        body: "Dermatology sources list weight loss, unusual diets and nutritional deficiencies alongside illness with fever, surgery, childbirth and emotional stress as common triggers. The American Academy of Dermatology mentions losing a substantial amount of weight among the events that can set off excess shedding. The common thread in these lists is a sudden shock to the body. It is the speed and scale of the change, rather than weight loss as such, that seems to matter most.",
      },
      {
        heading: 'What recovery tends to look like',
        body: "Telogen effluvium is generally described as temporary. Shedding usually peaks and then tapers, with the NHS listing weight loss among causes of hair loss that often settle. The AAD notes that hair commonly regains its usual fullness within six to nine months once the body readjusts. If restriction continues, or several triggers stack up, shedding can become prolonged, and repeated episodes can sometimes unmask pattern hair loss. Because shedding can have several overlapping causes, a qualified healthcare professional is the right person to assess shedding that is heavy or does not settle.",
      },
    ],
    references: [
      "DermNet — Telogen effluvium (hair shedding). https://dermnetnz.org/topics/telogen-effluvium",
      "American Academy of Dermatology — Do you have hair loss or hair shedding? https://www.aad.org/public/diseases/hair-loss/insider/shedding",
      "NHS — Hair loss. https://www.nhs.uk/conditions/hair-loss/",
    ],
  },
  {
    slug: 'nutrition-vitamin-b12-and-folate',
    title: 'Vitamin B12, folate and what is actually known',
    category: 'nutrition',
    standfirst:
      "B12 and folate are essential for making new cells, but research linking them to common forms of hair loss remains limited and inconsistent.",
    readingMinutes: 3,
    updated: '2026-09-11',
    keyTakeaways: [
      "B12 and folate are both needed for DNA synthesis in rapidly dividing cells.",
      "B12 deficiency is more common in some groups, including people on strict plant-based diets and those with absorption problems.",
      "Reviews find insufficient evidence to support routine testing or supplementation for most hair loss.",
      "B12 deficiency can cause lasting nerve problems, so it matters for reasons beyond hair.",
    ],
    sections: [
      {
        heading: 'Why they come up',
        body: "Vitamin B12 and folate work together in making DNA, which is needed every time a cell divides. Hair follicles contain some of the fastest-dividing cells in the body, so it is plausible that a shortage could affect them. Both deficiencies can also cause anaemia, and anaemia is itself associated with fatigue and sometimes with hair changes. This biological logic explains why these vitamins are often included in hair-focused products, even though direct evidence is modest.",
      },
      {
        heading: 'Who is more likely to be low',
        body: "B12 is found mainly in animal foods and needs a protein made in the stomach to be absorbed well. MedlinePlus describes higher risk in people following strict vegetarian or vegan diets, those with conditions such as pernicious anaemia, coeliac disease or Crohn's disease, people who have had stomach or bowel surgery, and those on certain long-term medicines, including some acid-reducing drugs and metformin. Folate deficiency has become less common in countries where foods are fortified, and one review found no meaningful difference in folate between people with hair loss and those without.",
      },
      {
        heading: 'What the research concludes',
        body: "A major review of vitamins and minerals in hair loss found insufficient evidence to recommend routine B12 or folate testing or supplementation for most types of hair loss, although some work has explored a possible role in alopecia areata. That does not make B12 unimportant. Untreated deficiency can cause numbness, balance problems and memory difficulties that may become permanent. Anyone with symptoms or risk factors is best assessed by a qualified healthcare professional, who can also consider how the two vitamins interact in testing.",
      },
    ],
    references: [
      "MedlinePlus — Vitamin B12 deficiency anemia. https://medlineplus.gov/ency/article/000574.htm",
      ALMOHANNA,
      GUO_KATTA,
    ],
  },
  {
    slug: 'nutrition-when-more-is-worse',
    title: 'When more is worse: vitamin A and selenium',
    category: 'nutrition',
    standfirst:
      "Some nutrients linked to healthy hair can themselves cause hair loss in excess, which is one of the less-discussed risks of stacking supplements.",
    readingMinutes: 4,
    updated: '2026-09-11',
    keyTakeaways: [
      "Too much vitamin A has been linked to hair loss in several reviews.",
      "Selenium deficiency and selenium excess can both affect hair.",
      "A misformulated supplement in 2008 caused an outbreak of selenium poisoning in which hair loss was common.",
      "Combining several products can add up the same nutrient without it being obvious.",
    ],
    sections: [
      {
        heading: 'A paradox in the evidence',
        body: "It is easy to assume that if a nutrient is needed for hair, more of it can only help. Research does not support that assumption. Reviews of diet and hair loss point out that several nutrients commonly found in hair supplements, including vitamin A, selenium and vitamin E, have been associated with harm or with hair loss when taken in excess. The authors describe this as a real risk of over-supplementation, particularly because many people take more than one product at once.",
      },
      {
        heading: 'Vitamin A',
        body: "Vitamin A is fat-soluble and stored in the liver, so it can accumulate over time. Reviews report that high intake is associated with hair loss, and a deficiency link has not been clearly shown. MedlinePlus notes that vitamin A poisoning can be acute or chronic, that children are more vulnerable, and that very high amounts in pregnancy are linked to birth defects. It also notes that swallowing products containing retinol, such as some skin creams, can contribute to poisoning, a reminder that intake can come from unexpected places.",
      },
      {
        heading: 'Selenium',
        body: "Selenium is a trace mineral needed in small quantities. In 2008, a liquid supplement in the United States was found to contain far more selenium than its label stated. Follow-up research described significant hair loss, nail changes, diarrhoea, joint pain and fatigue among people who took it, and a sizeable share still reported symptoms more than two years later. Reviews also note that a shortage of selenium can affect hair, which shows how narrow the useful range can be. A qualified healthcare professional can review the combined contents of any supplements a person takes.",
      },
    ],
    references: [
      "Morris JS, Crane SB — Selenium toxicity from a misformulated dietary supplement, adverse health effects, and the temporal response in the nail biologic monitor (Nutrients, 2013). https://pmc.ncbi.nlm.nih.gov/articles/PMC3705333/",
      "MedlinePlus — Vitamin A. https://medlineplus.gov/ency/article/002400.htm",
      GUO_KATTA,
      ALMOHANNA,
    ],
  },
  {
    slug: 'nutrition-collagen-claims',
    title: 'Collagen claims and the evidence gap',
    category: 'nutrition',
    standfirst:
      "Collagen is heavily promoted for hair, but the studies behind those claims are few, often company-funded, and usually test mixtures rather than collagen alone.",
    readingMinutes: 3,
    updated: '2026-09-11',
    keyTakeaways: [
      "Hair is made of keratin, not collagen, though collagen surrounds the follicle in the skin.",
      "Swallowed collagen is broken down into amino acids and small fragments during digestion.",
      "Much of the published research is sponsored by manufacturers and tests multi-ingredient products.",
      "Dermatologists quoted by major clinics describe the hair evidence as unproven.",
    ],
    sections: [
      {
        heading: 'What collagen is and is not',
        body: "Collagen is the main structural protein of skin, tendons and bone. It forms part of the tissue around each hair follicle, but the hair shaft itself is made of a different protein, keratin. When collagen is eaten or taken as a powder, digestion breaks it down into amino acids and short chains of them. Whether enough of those fragments reach the skin to make a difference, and whether they act any differently from protein in ordinary food, are open questions.",
      },
      {
        heading: 'What the studies look like',
        body: "Some trials report improvements in skin and hair measures after collagen products. A 2024 placebo-controlled trial, for example, reported more hairs counted on the scalp after twelve weeks, but the product also contained vitamin C, the trial was funded by the manufacturer, and most of the authors worked for it. This pattern is common. Reviewers point out that when collagen is combined with other nutrients, it is not possible to tell which ingredient, if any, produced the effect.",
      },
      {
        heading: 'How clinicians tend to view it',
        body: "A Cleveland Clinic dermatologist has described the question of whether collagen helps hair as unanswered, noting the small size and industry sponsorship of the supporting studies. Collagen is generally considered low risk for most people, but low risk is not the same as proven benefit. Independent, larger trials testing collagen on its own would be needed to settle the question. Anyone weighing it against other options for hair loss can discuss the evidence with a qualified healthcare professional.",
      },
    ],
    references: [
      "Cleveland Clinic — Collagen won't hurt hair growth, but it probably won't help either. https://health.clevelandclinic.org/collagen-for-hair-growth",
      "Reilly DM et al. — A clinical trial shows improvement in skin collagen, hydration, elasticity, wrinkles, scalp, and hair condition following 12-week oral intake of a supplement containing hydrolysed collagen (Dermatology Research and Practice, 2024). https://pmc.ncbi.nlm.nih.gov/articles/PMC11254459/",
    ],
  },
  {
    slug: 'nutrition-eating-disorders-and-hair',
    title: 'Hair changes linked to eating disorders',
    category: 'nutrition',
    standfirst:
      "Eating disorders often affect hair, both through shedding on the scalp and through fine new hair on the body, and these changes can be an early visible sign.",
    readingMinutes: 4,
    updated: '2026-09-11',
    keyTakeaways: [
      "Telogen effluvium is common in people with eating disorders, reflecting disruption of the hair cycle by undernutrition.",
      "Lanugo, a fine downy body hair, is closely associated with anorexia nervosa.",
      "Deficiencies in iron, zinc, copper and protein can change hair texture and colour.",
      "Hair changes commonly improve with nutritional recovery, and support is available.",
    ],
    sections: [
      {
        heading: 'Why hair is affected',
        body: "Eating disorders can leave the body short of energy, protein and many micronutrients at the same time. Hair follicles are highly active and not essential for survival, so they are among the first tissues to show strain. A 2024 review of skin signs in eating disorders described telogen effluvium, a temporary increase in resting and shedding hairs, as a hallmark of undernutrition. Studies it summarised reported this shedding in a substantial proportion of people with eating disorders. The review also noted that skin and hair changes may help clinicians recognise a disorder that has not been disclosed.",
      },
      {
        heading: 'Lanugo and texture changes',
        body: "A striking sign in anorexia nervosa is lanugo: soft, fine hair that grows on the back, abdomen, arms and sometimes the face. It is thought to help the body hold on to heat when fat stores are very low, and it is rarely seen in other forms of malnutrition. The NHS lists scalp hair loss and downy body hair among the physical signs of anorexia. Shortages of specific nutrients can add their own effects, with copper deficiency linked to lighter or wiry hair and iron and zinc deficiency linked to shedding.",
      },
      {
        heading: 'Recovery and support',
        body: "Reviews describe these hair changes as largely reversible. Lanugo tends to fade and scalp hair commonly recovers as nutrition and weight are restored, although, like any shedding, it takes months to show. Hair changes are rarely the most urgent part of the picture; eating disorders affect the heart, bones and hormones too. The NHS stresses that getting help early gives the best chance of recovery. Anyone concerned about themselves or someone else can speak to a GP, another qualified healthcare professional, or a specialist eating disorder service.",
      },
    ],
    references: [
      "Rallis E et al. — The nutrient–skin connection: diagnosing eating disorders through dermatologic signs (Nutrients, 2024). https://pmc.ncbi.nlm.nih.gov/articles/PMC11676061/",
      "NHS — Symptoms of anorexia nervosa. https://www.nhs.uk/mental-health/conditions/anorexia/symptoms/",
      "DermNet — Telogen effluvium (hair shedding). https://dermnetnz.org/topics/telogen-effluvium",
    ],
  },
  {
    slug: 'nutrition-what-hair-supplement-research-shows',
    title: 'What hair supplement research actually shows',
    category: 'nutrition',
    standfirst:
      "Reviews draw a firm line between correcting a confirmed deficiency and taking supplements when levels are already normal, and the evidence on each side of that line is very different.",
    readingMinutes: 5,
    updated: '2026-09-11',
    keyTakeaways: [
      "Correcting a confirmed deficiency is the clearest role for nutrition in hair loss.",
      "Evidence for supplements in people without a deficiency is mixed, and study quality varies widely.",
      "Many hair products combine several nutrients, which makes it hard to tell what, if anything, works.",
      "Supplements are less tightly regulated than medicines, and some ingredients cause harm in excess.",
    ],
    sections: [
      {
        heading: 'Two very different questions',
        body: "Research on nutrition and hair tends to split into two questions. The first is whether a person who is genuinely deficient in something, such as iron or zinc, sees hair improve when the deficiency is corrected. For several nutrients the answer appears to be yes, at least for some people. The second is whether taking extra nutrients helps when levels are already adequate. Reviews by dermatologists repeatedly conclude that this second question has much weaker support, and that testing is best guided by a person's history and risk factors rather than done routinely.",
      },
      {
        heading: 'What a systematic review found',
        body: "A 2023 systematic review in JAMA Dermatology looked at trials of nutritional products in people without a known deficiency. It included thirty studies, seventeen of them randomised. Several multi-ingredient commercial formulas and a handful of single ingredients showed possible benefit in the better-quality studies, while others had only low-quality support. Side effects were described as rare and mild. The authors called for shared decision-making with a dermatologist and highlighted the limited regulatory oversight of these products. Differences in study design made firm conclusions difficult.",
      },
      {
        heading: 'Reasons for caution',
        body: "Many hair supplements contain a long list of ingredients, so even a positive trial cannot show which component mattered. Studies are often small, short and funded by the companies that sell the product. Some commonly included nutrients, such as vitamin A and selenium, have been linked to hair loss when taken in excess, and high-dose biotin can distort blood tests. Taking several products at once can quietly multiply the same ingredient. These are the reasons reviewers emphasise confirming a deficiency first.",
      },
      {
        heading: 'Putting it in context',
        body: "Nutrition is one piece of the hair loss picture, and for many people the main drivers are genetics, hormones, illness or stress rather than diet. Supplements are not a substitute for finding out which type of hair loss is present, because different types behave very differently over time. A qualified healthcare professional can help work out whether testing makes sense, interpret the results, and put any nutritional findings alongside the other possible causes.",
      },
    ],
    references: [
      "Drake L et al. — Evaluation of the safety and effectiveness of nutritional supplements for treating hair loss: a systematic review (JAMA Dermatology, 2023). https://jamanetwork.com/journals/jamadermatology/article-abstract/2798840",
      GUO_KATTA,
      ALMOHANNA,
    ],
  },
];

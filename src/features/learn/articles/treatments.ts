import type { Article } from '../library';

export const TREATMENTS_ARTICLES: Article[] = [
  {
    slug: 'treatments-how-regulators-approve-hair-loss-treatments',
    title: 'How hair loss treatments reach the market',
    category: 'treatments',
    standfirst:
      "Medicines, devices and supplements face very different levels of regulatory scrutiny, and the labels on them mean different things.",
    readingMinutes: 5,
    updated: '2026-09-11',
    keyTakeaways: [
      "Medicines are typically tested in several phases of trials before approval",
      "Many home-use devices are cleared, not approved — a different standard",
      "Dietary supplements are not reviewed for effectiveness before sale",
      "Approval covers a specific use, and safety monitoring continues afterwards",
    ],
    sections: [
      {
        heading: 'Medicines are tested in stages',
        body: "In the United States, the Food and Drug Administration describes drug research as a series of phases. Early studies involve small groups and focus mainly on safety and how the body handles the medicine. Middle-stage studies look for signs of benefit and gather more side-effect data in people who have the condition. Late-stage trials enrol hundreds to thousands of participants over longer periods, which gives a better chance of detecting less common harms. Only a minority of candidate medicines make it through every stage, and the agency then reviews the combined evidence before deciding whether to approve.",
      },
      {
        heading: 'Devices follow a separate route',
        body: "Medical devices are sorted by risk. The most demanding route, premarket approval, requires scientific evidence that a device is safe and effective for its intended use. Many lower-risk devices instead go through a clearance process, where the maker shows that the product is substantially equivalent to one already on the market. Most home-use laser and light devices for hair loss have reached the market through clearance. That is why the phrase 'FDA-cleared' appears on such products, and why dermatology organisations point out that the bar is lower than for medicines.",
      },
      {
        heading: 'Supplements are not pre-approved',
        body: "Dietary supplements sit in a different category again. The FDA states that it does not have the authority to approve supplements before they are sold; manufacturers carry the initial responsibility for safety, and the agency acts mainly after problems emerge. When a supplement label describes an effect on the body's structure or function, such as supporting hair, it must carry a standard disclaimer noting that the claim has not been evaluated by the FDA. A claim on a pack is therefore not evidence that a product works.",
      },
      {
        heading: 'Approval is not the end of the story',
        body: "An approval applies to a particular condition and population. Doctors sometimes prescribe an approved medicine for a different purpose, which is called off-label use; oral minoxidil for hair loss is one commonly discussed example. Safety review also continues after approval. In 2021, for instance, the FDA required stronger boxed warnings for a class of immune-modulating medicines after a large post-marketing study. Other countries have their own regulators, so availability and labelling can differ by region. Anyone weighing a treatment is best served by discussing its regulatory status and evidence with a dermatologist or doctor.",
      },
    ],
    references: [
      'U.S. Food and Drug Administration — Step 3: Clinical Research. https://www.fda.gov/patients/drug-development-process/step-3-clinical-research',
      'U.S. Food and Drug Administration — Device Approvals and Clearances. https://www.fda.gov/medical-devices/products-and-medical-procedures/device-approvals-and-clearances',
      'U.S. Food and Drug Administration — Questions and Answers on Dietary Supplements. https://www.fda.gov/food/information-consumers-using-dietary-supplements/questions-and-answers-dietary-supplements',
      'U.S. Food and Drug Administration — Drug Safety Communication on JAK inhibitors (2021). https://www.fda.gov/media/151936/download',
    ],
  },
  {
    slug: 'treatments-topical-minoxidil-what-the-evidence-shows',
    title: 'Topical minoxidil: what the evidence shows',
    category: 'treatments',
    standfirst:
      "One of the longest-studied hair loss treatments, topical minoxidil has a well-described track record — and well-described limits.",
    readingMinutes: 5,
    updated: '2026-09-11',
    keyTakeaways: [
      "Topical minoxidil is one of the main studied treatments for pattern hair loss",
      "Its exact mechanism is still not fully understood",
      "Any effect typically takes many months to appear",
      "Gains are commonly lost within months of stopping",
    ],
    sections: [
      {
        heading: 'What it is',
        body: "Minoxidil was first approved as a tablet for high blood pressure; a version applied to the scalp is used for pattern hair loss. MedlinePlus notes that the precise way it stimulates hair growth is not known. In the United States it is sold without a prescription, and the NHS lists it among the main treatments for male pattern hair loss and notes that it is also used for female pattern hair loss, although it is generally not available through the NHS itself.",
      },
      {
        heading: 'What studies report',
        body: "Randomised trials have found that topical minoxidil produces more hair regrowth than a placebo in a meaningful share of people with pattern hair loss, and a 2025 network meta-analysis ranked it as the most effective topical option among those compared in men. The American Academy of Dermatology describes many users seeing some regrowth, but stresses that it helps early hair loss rather than restoring a full head of hair. MedlinePlus notes it appears most effective in younger people whose loss is recent, and that it does not work on a receding hairline.",
      },
      {
        heading: 'Side effects discussed in the literature',
        body: "The most commonly reported problems are local: itching, dryness, flaking and irritation of the scalp. Because minoxidil acts on blood vessels, drug information sources also list less common symptoms that warrant prompt medical attention, such as a racing heartbeat, chest pain, lightheadedness, sudden weight gain or swelling of the face or ankles. Unwanted hair growth in other areas has also been described, particularly with forms taken by mouth. Reactions vary between people and between formulations.",
      },
      {
        heading: 'Timescales and limits',
        body: "Drug information sources describe a wait of at least four months, and sometimes up to a year, before any effect can be judged. Results are not guaranteed; the NHS notes that these treatments do not work for everyone. They also only work while in use: MedlinePlus reports that most new hair is lost within a few months of stopping. Whether topical minoxidil is suitable depends on the type of hair loss, health history and other medicines, which is why that decision belongs with a dermatologist, doctor or pharmacist.",
      },
    ],
    references: [
      'MedlinePlus (U.S. National Library of Medicine) — Minoxidil Topical. https://medlineplus.gov/druginfo/meds/a689003.html',
      'American Academy of Dermatology — What is male pattern hair loss, and can it be treated? https://www.aad.org/public/diseases/hair-loss/treatment/male-pattern-hair-loss-treatment',
      'NHS — Hair loss. https://www.nhs.uk/conditions/hair-loss/',
      'Journal of Cosmetic Dermatology (2025) — Comparative Efficacy of Minoxidil and 5-Alpha Reductase Inhibitors Monotherapy for Male Pattern Hair Loss: Network Meta-Analysis. https://pmc.ncbi.nlm.nih.gov/articles/PMC12207719/',
    ],
  },
  {
    slug: 'treatments-oral-finasteride-what-studies-report',
    title: 'Oral finasteride: what studies report',
    category: 'treatments',
    standfirst:
      "Finasteride works on a hormonal pathway behind male pattern hair loss, and its benefits and side-effect questions are both widely studied.",
    readingMinutes: 6,
    updated: '2026-09-11',
    keyTakeaways: [
      "Finasteride lowers levels of DHT, a hormone linked to pattern hair loss",
      "It is approved for male pattern hair loss, not for women",
      "Sexual and mood side effects are discussed by regulators and researchers",
      "Benefits commonly fade after the medicine is stopped",
    ],
    sections: [
      {
        heading: 'How it is thought to work',
        body: "Finasteride blocks an enzyme called 5-alpha reductase, which converts testosterone into dihydrotestosterone, or DHT. In people who are genetically susceptible, DHT is linked to the gradual shrinking of scalp hair follicles seen in male pattern hair loss. DermNet describes finasteride as substantially reducing DHT in the scalp. It is approved for male pattern hair loss, and also used in a different form for prostate enlargement. The NHS states that women should not use it for hair loss, and drug information warns that exposure during pregnancy may affect a developing male baby.",
      },
      {
        heading: 'What trials have observed',
        body: "Clinical studies summarised by DermNet and the American Academy of Dermatology found that most men taking finasteride either kept their existing hair or showed some increase over the first year, with the AAD describing slowed hair loss in a large majority of men studied. Improvement typically takes at least three months to notice, and MedlinePlus describes results emerging over the first year. The AAD notes that outcomes tend to be better when treatment begins earlier in the course of hair loss. No study guarantees regrowth for any individual.",
      },
      {
        heading: 'Side-effect discussions',
        body: "The most frequently reported side effects are sexual: lower sex drive, erection difficulties and ejaculation changes. In the original trials these occurred in a small percentage of men, only slightly more often than on placebo, and usually resolved. However, the UK medicines regulator (MHRA) has strengthened its warnings, stating that depression, suicidal thoughts and sexual problems have been reported and may persist after stopping, and introduced patient alert cards. Researchers still debate these persistent symptoms, sometimes called post-finasteride syndrome: some reviews point to low-quality evidence and a nocebo effect, while regulators continue to treat the reports seriously.",
      },
      {
        heading: 'Other points and limits',
        body: "Finasteride lowers PSA, a blood marker used in prostate checks, so doctors interpreting that test need to know about it. Drug information also lists rare breast changes and allergic reactions. Like other pattern hair loss treatments, it only works while it is taken; MedlinePlus and DermNet both report that regrown hair is likely to be lost within about a year of stopping. Because the balance of benefits and risks depends on personal and mental health history, decisions about finasteride belong with a dermatologist or doctor.",
      },
    ],
    references: [
      'DermNet — Finasteride. https://dermnetnz.org/topics/finasteride',
      'MedlinePlus (U.S. National Library of Medicine) — Finasteride. https://medlineplus.gov/druginfo/meds/a698016.html',
      'MHRA (GOV.UK) — Finasteride and dutasteride: updated safety warnings for psychiatric side effects and sexual dysfunction. https://www.gov.uk/drug-safety-update/finasteride-and-dutasteride-updated-safety-warnings-for-psychiatric-side-effects-and-sexual-dysfunction',
      'International Journal of Trichology (2025) — Comment on Current Investigations into the Postfinasteride Syndrome. https://pmc.ncbi.nlm.nih.gov/articles/PMC12039781/',
    ],
  },
  {
    slug: 'treatments-oral-minoxidil-research',
    title: 'Oral minoxidil: what the research says so far',
    category: 'treatments',
    standfirst:
      "Minoxidil taken by mouth has become a widely discussed off-label option, but its evidence base is younger and less rigorous than for topical forms.",
    readingMinutes: 5,
    updated: '2026-09-11',
    keyTakeaways: [
      "Oral minoxidil is approved for blood pressure, not for hair loss",
      "Its use for hair loss is off-label and prescription-only",
      "Evidence is mostly observational rather than large placebo-controlled trials",
      "Unwanted body hair and fluid retention are the most discussed side effects",
    ],
    sections: [
      {
        heading: 'An off-label use',
        body: "Minoxidil tablets were originally approved to treat high blood pressure. Some dermatologists now prescribe the same medicine, at much lower amounts than used for blood pressure, for pattern hair loss and other hair conditions. Because regulators have not approved it for this purpose, the use is described as off-label. A 2022 review in the Indian Dermatology Online Journal emphasised this status and noted that the decision to use it should be individualised. DermNet also lists low-dose oral minoxidil among options for male pattern hair loss.",
      },
      {
        heading: 'Quality of the evidence',
        body: "Much of the research consists of case series, retrospective studies and observational reports rather than large, long, placebo-controlled trials of the kind usually required for approval. The 2022 review noted a shortage of rigorous clinical trials on its effectiveness for pattern hair loss at that time. Comparative analyses have since suggested it may perform broadly similarly to topical minoxidil in some measures, but authors consistently call for more head-to-head and longer-term studies before firm conclusions can be drawn.",
      },
      {
        heading: 'Side effects in the literature',
        body: "A multicentre study of more than 1,400 patients, published in 2021, reported unwanted hair growth on the face or body as the most common effect, affecting roughly one in seven people. Lightheadedness, fluid retention and a faster heartbeat were less common, and fewer than 2% stopped treatment because of side effects. A 2025 narrative review added that fluid retention seems more frequent in women and that serious heart-related complications are very rare, sometimes linked to dosing errors. Researchers stress careful selection and medical monitoring.",
      },
      {
        heading: 'Uncertainties that remain',
        body: "Open questions include how oral minoxidil compares with established treatments over years, which people benefit most, and how it behaves in people with heart or blood pressure conditions. Like other minoxidil forms, its effects are understood to depend on continued use. The retrospective design of much of the safety data means some risks may be under- or over-estimated. Because it is a prescription medicine with effects on the heart and circulation, any consideration of it belongs in a conversation with a dermatologist or doctor.",
      },
    ],
    references: [
      'Journal of the American Academy of Dermatology (2021) — Safety of low-dose oral minoxidil for hair loss: a multicentre study of 1,404 patients (Vañó-Galván et al.). https://europepmc.org/article/MED/33639244',
      'Indian Dermatology Online Journal (2022) — Role of Oral Minoxidil in Patterned Hair Loss. https://pmc.ncbi.nlm.nih.gov/articles/PMC9650732/',
      'Journal of Clinical Medicine (2025) — Characterization and Management of Adverse Events of Low-Dose Oral Minoxidil Treatment for Alopecia: A Narrative Review. https://pmc.ncbi.nlm.nih.gov/articles/PMC11942662/',
      'DermNet — Male pattern hair loss. https://dermnetnz.org/topics/male-pattern-hair-loss',
      'Journal of Cosmetic Dermatology (2025) — Comparative Efficacy of Minoxidil and 5-Alpha Reductase Inhibitors Monotherapy for Male Pattern Hair Loss. https://pmc.ncbi.nlm.nih.gov/articles/PMC12207719/',
    ],
  },
  {
    slug: 'treatments-low-level-light-therapy-evidence',
    title: 'Low-level light therapy: weighing the evidence',
    category: 'treatments',
    standfirst:
      "Laser caps, combs and helmets are widely sold for hair loss; trials show some benefit, but with notable gaps.",
    readingMinutes: 5,
    updated: '2026-09-11',
    keyTakeaways: [
      "Low-level light devices use red light, not heat, on the scalp",
      "Sham-controlled trials report modest increases in hair density",
      "Most studies are short, and long-term data are limited",
      "Most home devices are FDA-cleared rather than FDA-approved",
    ],
    sections: [
      {
        heading: 'What the devices do',
        body: "Low-level light therapy, sometimes called low-level laser therapy or photobiomodulation, shines red light from lasers or LEDs onto the scalp at intensities too low to heat or damage tissue. The idea is that the light may stimulate activity in hair follicle cells, although the biological mechanism is still being studied. Devices come as caps, helmets, headbands and combs. A 2021 review counted dozens of home-use devices cleared in the United States, most of them cap-style designs using laser diodes.",
      },
      {
        heading: 'What trials have found',
        body: "Several randomised trials have compared active devices with identical-looking sham devices that emit no therapeutic light. A 2021 meta-analysis in the Journal of Clinical and Aesthetic Dermatology pooled seven such double-blind trials and found a statistically significant increase in hair density with the active devices, in both men and women with mild to moderate pattern hair loss. An earlier 2018 systematic review reached a similar conclusion, describing the approach as promising while urging caution in interpreting the results.",
      },
      {
        heading: 'Limits of the evidence',
        body: "The trials followed participants for about six months at most, so long-term benefit is not well established. Studies were relatively small, varied in device design and settings, and did not compare devices directly with one another. Reviewers have also flagged the role of manufacturer funding and called for larger, independently funded studies. DermNet describes the benefit as unproven. And because most home devices reach the market through the FDA's clearance pathway, which relies on similarity to existing devices, clearance says less about effectiveness than approval would.",
      },
      {
        heading: 'Safety and context',
        body: "Reported side effects in the trials were generally minor, such as headache, scalp itching or dry skin, and several studies reported none. Because hair loss has many causes and light therapy has only been studied in certain types, a dermatologist or doctor is best placed to help interpret whether the evidence applies to a particular situation.",
      },
    ],
    references: [
      'Journal of Clinical and Aesthetic Dermatology (2021) — A Systematic Review and Meta-analysis of Randomized Controlled Trials of FDA-Approved, Home-use, Low-Level Light/Laser Therapy Devices for Pattern Hair Loss. https://pmc.ncbi.nlm.nih.gov/articles/PMC8675345/',
      'DermNet — Male pattern hair loss. https://dermnetnz.org/topics/male-pattern-hair-loss',
      'U.S. Food and Drug Administration — Device Approvals and Clearances. https://www.fda.gov/medical-devices/products-and-medical-procedures/device-approvals-and-clearances',
    ],
  },
  {
    slug: 'treatments-platelet-rich-plasma-evidence',
    title: 'Platelet-rich plasma: what studies suggest',
    category: 'treatments',
    standfirst:
      "Scalp injections made from a person's own blood are increasingly offered for hair loss, but methods vary widely and questions remain.",
    readingMinutes: 5,
    updated: '2026-09-11',
    keyTakeaways: [
      "PRP uses a concentrate of platelets from the person's own blood",
      "Meta-analyses report increases in hair density compared with placebo",
      "Preparation methods vary a lot, making results hard to compare",
      "Effects are not permanent and repeat sessions are typical",
    ],
    sections: [
      {
        heading: 'What PRP involves',
        body: "Platelet-rich plasma is made by drawing a small amount of a person's blood and spinning it in a centrifuge to concentrate the platelets, which carry growth factors involved in tissue repair. The concentrate is then injected into areas of the scalp. The rationale is that these growth factors may support hair follicles, though the precise mechanism is still under investigation. The American Academy of Dermatology lists PRP among in-office procedures for hair loss and notes that it is not a permanent treatment.",
      },
      {
        heading: 'What the research shows',
        body: "A 2025 systematic review and meta-analysis in Dermatology and Therapy pooled 43 randomised trials with nearly 1,900 participants. It found that one form of PRP increased hair density compared with placebo and was associated with improved satisfaction, but it did not find a clear benefit for hair thickness. When compared with established treatments such as topical minoxidil, PRP performed similarly rather than better. The large majority of the evidence concerned androgenetic alopecia, so less is known about other types of hair loss.",
      },
      {
        heading: 'Why results are hard to compare',
        body: "There is no single standard way to prepare PRP. Trials differ in how the blood is processed, whether the plasma is activated, how many white cells it contains, how often sessions take place and how outcomes are measured. The 2025 review noted that composition was often poorly reported and that many studies lacked adequate blinding. This variability produced high statistical heterogeneity, meaning the pooled findings should be read with caution. DermNet describes PRP as still under investigation.",
      },
      {
        heading: 'Side effects and open questions',
        body: "Reported side effects are generally mild and short-lived, including pain or discomfort at the injection sites, redness, swelling and bruising. The 2025 review did not find a meaningful difference in adverse events between PRP and control groups overall. Open questions include the best preparation method, how long benefits last and who is most likely to respond. Anyone considering an in-office procedure like this may find it helpful to discuss the evidence and their diagnosis with a dermatologist or doctor.",
      },
    ],
    references: [
      'Dermatology and Therapy (2025) — Platelet-Rich Plasma in the Management of Alopecia: A Systematic Review and Meta-Analysis of Clinical Evidence. https://pmc.ncbi.nlm.nih.gov/articles/PMC12550094/',
      'American Academy of Dermatology — What is male pattern hair loss, and can it be treated? https://www.aad.org/public/diseases/hair-loss/treatment/male-pattern-hair-loss-treatment',
      'DermNet — Male pattern hair loss. https://dermnetnz.org/topics/male-pattern-hair-loss',
    ],
  },
  {
    slug: 'treatments-microneedling-research',
    title: 'Microneedling for hair loss: the research so far',
    category: 'treatments',
    standfirst:
      "Tiny controlled punctures in the scalp are being studied mainly as an add-on to other treatments, with promising but uneven evidence.",
    readingMinutes: 4,
    updated: '2026-09-11',
    keyTakeaways: [
      "Microneedling creates tiny controlled injuries in the scalp",
      "Most studies test it combined with topical minoxidil",
      "Combined approaches outperformed minoxidil alone in pooled trials",
      "Study populations and methods limit how widely results apply",
    ],
    sections: [
      {
        heading: 'What microneedling is',
        body: "Microneedling uses a roller or powered device covered with very fine needles to create many tiny punctures in the skin. Researchers think this controlled injury may trigger healing responses, including new blood vessel formation and signalling to hair follicle stem cells. The tiny channels may also increase how much of a topical medicine penetrates the skin. The American Academy of Dermatology lists microneedling devices among at-home approaches, and it is also performed in clinics.",
      },
      {
        heading: 'What studies report',
        body: "A 2025 systematic review and meta-analysis in Archives of Dermatological Research looked at 12 randomised trials involving about 630 people with androgenetic alopecia. Microneedling combined with topical minoxidil was associated with greater increases in hair count and hair diameter than minoxidil alone, and with higher satisfaction ratings from both investigators and participants. Differences in needle depth, device type and treatment length did not appear to change results significantly, although the authors noted this needs further study.",
      },
      {
        heading: 'Side effects and limitations',
        body: "Adverse events were somewhat more frequent in combined-treatment groups but were mostly mild and short-lived. Scalp itching was the most common, alongside discomfort during sessions, redness and occasional headache. The review found notable limitations: trials were mainly from Asia, the Middle East and North Africa, randomisation methods were not always well described, and hair count results varied a great deal between studies. Very little research has examined microneedling on its own, so its standalone effect is uncertain.",
      },
      {
        heading: 'Reading the evidence',
        body: "Taken together, the research positions microneedling as a possible add-on rather than a standalone treatment, with benefit shown over relatively short periods. Because it breaks the skin barrier, questions of hygiene, technique and infection risk also matter, and it may not be appropriate for people with certain skin conditions. Larger and more diverse trials are still needed. A dermatologist or doctor can help put these findings in the context of a specific diagnosis and existing treatments.",
      },
    ],
    references: [
      'Archives of Dermatological Research (2025) — Evaluating the efficacy and safety of combined microneedling therapy versus topical Minoxidil in androgenetic alopecia: a systematic review and meta-analysis. https://pmc.ncbi.nlm.nih.gov/articles/PMC11890238/',
      'American Academy of Dermatology — Hair loss: Diagnosis and treatment. https://www.aad.org/public/diseases/hair-loss/treatment/diagnosis-treat',
    ],
  },
  {
    slug: 'treatments-alopecia-areata-jak-inhibitors',
    title: 'Treatments studied for alopecia areata',
    category: 'treatments',
    standfirst:
      "Alopecia areata is an autoimmune condition, and newer medicines that calm specific immune signals have changed the treatment landscape.",
    readingMinutes: 6,
    updated: '2026-09-11',
    keyTakeaways: [
      "Alopecia areata is autoimmune and its course is unpredictable",
      "Older options include corticosteroids and contact immunotherapy",
      "Several JAK inhibitors are now approved for severe cases",
      "JAK inhibitors carry boxed warnings, and relapse after stopping is common",
    ],
    sections: [
      {
        heading: 'A different kind of hair loss',
        body: "Alopecia areata occurs when the immune system attacks hair follicles, typically causing round patches of hair loss, and sometimes loss of all scalp or body hair. Unlike pattern hair loss, it can resolve on its own, and DermNet notes that hair may regrow without treatment even though relapses are common and the course is hard to predict. This unpredictability makes treatment research challenging, because improvement in a trial must be compared against the regrowth that would have happened anyway.",
      },
      {
        heading: 'Longer-established approaches',
        body: "For limited patches, DermNet describes corticosteroid injections into the affected skin as a way that may speed regrowth, along with strong corticosteroid preparations applied to the skin and other topical agents. For more extensive disease, contact immunotherapy uses a chemical to provoke a mild allergic reaction on the scalp, which is thought to redirect the immune response; it can cause significant irritation and skin colour changes. Oral corticosteroids have been used in severe cases but are limited by their known side effects with longer use.",
      },
      {
        heading: 'JAK inhibitors',
        body: "Janus kinase (JAK) inhibitors are oral medicines that block signalling pathways used by immune cells. In 2022 the FDA approved baricitinib as the first systemic treatment for severe alopecia areata in adults, followed by ritlecitinib and deuruxolitinib. A 2025 review in Dermatology and Therapy summarised pivotal trials in which roughly a third to two-fifths of participants reached substantial scalp coverage after about six to nine months. Responses varied widely, and many participants did not reach this level of regrowth.",
      },
      {
        heading: 'Safety and relapse',
        body: "Commonly reported side effects in alopecia areata trials include acne, upper respiratory infections, headache, nausea and raised cholesterol. In 2021 the FDA required boxed warnings for several JAK inhibitors covering serious infections, heart-related events, blood clots, cancer and death, based largely on data from older adults with rheumatoid arthritis. Reviews also report that hair loss often returns within months of stopping. Because of these trade-offs, decisions about alopecia areata treatment belong with a dermatologist who can assess severity and health history.",
      },
    ],
    references: [
      'DermNet — Alopecia areata. https://dermnetnz.org/topics/alopecia-areata',
      'Dermatology and Therapy (2025) — Evaluating Current and Emergent JAK Inhibitors for Alopecia Areata: A Narrative Review. https://pmc.ncbi.nlm.nih.gov/articles/PMC12454744/',
      'U.S. Food and Drug Administration — FDA requires warnings about increased risk of serious heart-related events, cancer, blood clots, and death for JAK inhibitors (2021). https://www.fda.gov/media/151936/download',
    ],
  },
  {
    slug: 'treatments-why-treatments-take-months-to-judge',
    title: 'Why hair treatments take months to judge',
    category: 'treatments',
    standfirst:
      "The hair growth cycle sets the pace for any treatment, which is why early impressions are often misleading.",
    readingMinutes: 4,
    updated: '2026-09-11',
    keyTakeaways: [
      "Scalp follicles spend years growing and months resting",
      "Changes in shedding show up weeks to months after a trigger",
      "Drug information describes months before effects can be judged",
      "Consistent photos over time are more reliable than day-to-day impressions",
    ],
    sections: [
      {
        heading: 'The cycle sets the pace',
        body: "Each scalp hair follicle runs through a cycle of growing, transitioning and resting. DermNet describes the growth phase as lasting several years for a typical scalp follicle, followed by a resting phase of a few months before the hair is shed and a new one begins. Because follicles are not synchronised, only a small share change phase at any moment. Any treatment that influences the cycle therefore works gradually, one follicle at a time, and visible change in overall density lags well behind what is happening beneath the skin.",
      },
      {
        heading: 'Delays in both directions',
        body: "The same lag works in reverse. DermNet notes that when something disrupts the cycle, such as illness or major stress, increased shedding tends to appear two to four months later, and recovery takes several more months. This delay means changes in hair can be linked to the wrong cause. A new product started just before shedding begins may be blamed or credited for something set in motion months earlier, while real effects of a treatment may not show until long after it is started.",
      },
      {
        heading: 'What drug information describes',
        body: "Official drug information reflects this slow timescale. MedlinePlus describes topical minoxidil as needing at least four months, and possibly up to a year, before any effect can be seen, and finasteride as needing at least three months, with results developing over the first year. The American Academy of Dermatology gives similar ranges. Clinical trials of hair loss treatments therefore typically run for several months, and measure hair counts in defined areas rather than relying on general impressions.",
      },
      {
        heading: 'Tracking change fairly',
        body: "Because mirrors and memory are unreliable over months, consistent photographs taken under similar lighting and angles offer a steadier record. Even so, photos cannot show why hair is changing. Increased shedding, slower growth or a lack of visible change can have many explanations, some of which need medical assessment. Anyone trying to interpret changes in their hair, especially while using a treatment, will get the most reliable answer from a dermatologist or doctor.",
      },
    ],
    references: [
      'DermNet — Telogen effluvium. https://dermnetnz.org/topics/telogen-effluvium',
      'MedlinePlus (U.S. National Library of Medicine) — Minoxidil Topical. https://medlineplus.gov/druginfo/meds/a689003.html',
      'MedlinePlus (U.S. National Library of Medicine) — Finasteride. https://medlineplus.gov/druginfo/meds/a698016.html',
      'American Academy of Dermatology — Hair loss: Diagnosis and treatment. https://www.aad.org/public/diseases/hair-loss/treatment/diagnosis-treat',
    ],
  },
  {
    slug: 'treatments-supplements-marketed-for-hair',
    title: 'Hair supplements: what the evidence says',
    category: 'treatments',
    standfirst:
      "Vitamins and minerals are heavily marketed for hair, but research mostly supports correcting genuine deficiencies rather than routine use.",
    readingMinutes: 5,
    updated: '2026-09-11',
    keyTakeaways: [
      "Supplements are not reviewed for effectiveness before sale",
      "Evidence mainly supports treating confirmed deficiencies",
      "Excess vitamin A or selenium has been linked to hair loss",
      "Biotin can distort some laboratory blood tests",
    ],
    sections: [
      {
        heading: 'How supplements are regulated',
        body: "Unlike medicines, dietary supplements do not need to show they work before being sold. The FDA explains that it cannot approve supplements in advance and that manufacturers are responsible for their safety. Labels that describe supporting hair, skin or nails must carry a disclaimer stating that the claim has not been evaluated by the agency. This means a product's marketing and its scientific evidence can be very different things, and many hair supplements combine several ingredients at varying amounts.",
      },
      {
        heading: 'Deficiency versus top-up',
        body: "Hair follicles are among the most actively dividing tissues in the body, so nutrition does matter. A 2018 review in Dermatology and Therapy examined vitamins A, B, C, D and E, iron, selenium and zinc in hair loss. It found the strongest support for correcting deficiencies that have been confirmed, such as low iron or low vitamin D, while evidence for supplementing people with normal levels was weak or absent. For zinc and vitamin E, the authors found the data too inconsistent or limited to support routine use.",
      },
      {
        heading: 'When more is not better',
        body: "Some nutrients can cause harm, including hair loss, when taken in excess. The same review notes that too much vitamin A and too much selenium are both recognised causes of hair shedding. For biotin, which is common in hair products, the authors found no good evidence of benefit in people without a deficiency, which is rare. They also highlighted that high biotin intake can interfere with certain laboratory tests, potentially producing falsely high or low results, including in tests used to help diagnose heart attacks.",
      },
      {
        heading: 'Putting it in context',
        body: "The American Academy of Dermatology describes supplements such as iron, zinc or biotin as potentially helpful when a person is deficient, which is usually established through a clinical assessment and blood tests. Because hair loss has many possible causes and some supplements carry risks or interact with tests and medicines, a dermatologist, doctor or registered dietitian is the right person to advise on whether testing or supplementation makes sense in an individual case.",
      },
    ],
    references: [
      'Dermatology and Therapy (2018) — The Role of Vitamins and Minerals in Hair Loss: A Review. https://pmc.ncbi.nlm.nih.gov/articles/PMC6380979/',
      'U.S. Food and Drug Administration — Questions and Answers on Dietary Supplements. https://www.fda.gov/food/information-consumers-using-dietary-supplements/questions-and-answers-dietary-supplements',
      'American Academy of Dermatology — Hair loss: Diagnosis and treatment. https://www.aad.org/public/diseases/hair-loss/treatment/diagnosis-treat',
    ],
  },
  {
    slug: 'treatments-why-stopping-can-reverse-gains',
    title: 'Why stopping a treatment can reverse gains',
    category: 'treatments',
    standfirst:
      "Most treatments for pattern hair loss manage an ongoing process rather than cure it, so their effects commonly fade once they stop.",
    readingMinutes: 4,
    updated: '2026-09-11',
    keyTakeaways: [
      "Pattern hair loss is a continuing process, not a one-off event",
      "Major treatments act only while they are being used",
      "Hair regained on treatment is commonly lost within months of stopping",
      "Relapse after stopping is also reported with alopecia areata medicines",
    ],
    sections: [
      {
        heading: 'Managing, not curing',
        body: "Androgenetic alopecia, the most common form of hair loss, is driven by genetics and hormones that continue to act throughout life. Treatments studied for it work by counteracting parts of that process, for example by lowering hormone activity at the follicle or by prolonging the growth phase. They do not switch off the underlying cause. The NHS states plainly that the main medicines for pattern baldness only work for as long as they are used, and that they do not work for everyone.",
      },
      {
        heading: 'What sources describe after stopping',
        body: "Official drug information describes a consistent pattern. MedlinePlus reports that most new hair grown with topical minoxidil is lost within a few months after it is stopped, and that hair regrown with finasteride is likely to be lost within about a year of stopping. DermNet explains that when finasteride is stopped, hormone levels in the scalp rise again and hair loss typically resumes. The American Academy of Dermatology likewise notes that the benefits of these treatments depend on continuing them.",
      },
      {
        heading: 'Beyond pattern hair loss',
        body: "A similar pattern appears in other conditions. A 2025 review of JAK inhibitors for alopecia areata reported that hair loss commonly returns within a few months of stopping treatment, and that continued therapy has so far been the main way to maintain results. The AAD also describes platelet-rich plasma as non-permanent, with maintenance sessions typically used. In contrast, hair transplant surgery relocates follicles and is described by the AAD as giving permanent results.",
      },
      {
        heading: 'Why this matters',
        body: "Knowing that effects depend on continued use helps put a treatment's long-term commitment, cost and side-effect profile into perspective. It also explains why changes seen months after stopping can be confusing to interpret. Some people stop because of side effects or other health reasons, and those decisions involve trade-offs that are specific to each person. Any plan to start, change or stop a hair loss treatment is best discussed with the dermatologist or doctor overseeing it.",
      },
    ],
    references: [
      'NHS — Hair loss. https://www.nhs.uk/conditions/hair-loss/',
      'MedlinePlus (U.S. National Library of Medicine) — Minoxidil Topical. https://medlineplus.gov/druginfo/meds/a689003.html',
      'DermNet — Finasteride. https://dermnetnz.org/topics/finasteride',
      'Dermatology and Therapy (2025) — Evaluating Current and Emergent JAK Inhibitors for Alopecia Areata: A Narrative Review. https://pmc.ncbi.nlm.nih.gov/articles/PMC12454744/',
    ],
  },
];

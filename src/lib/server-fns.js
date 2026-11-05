import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";
import { bmi, bmiCategory, idealWeight, computeNrs, computeTargets } from "@/lib/clinical";
import { DEFAULT_FORMULAS, DEFAULT_PROTOCOLS } from "@/lib/clinicalDefaults";
import { SEED_SOURCES } from "@/lib/knowledgeBase";
import { addDaysISO, reviewDaysFor, todayISO } from "@/lib/reviewDates";

const searchSchema = z.object({ search: z.string().max(80).optional() });

// خواندن‌ها با فیلتر صریح مالکیت انجام می‌شود تا پرونده‌های هر حساب پس از خروج و
// ورود دوباره همیشه برگردند و به وضعیت نشست یا حافظه محلی وابسته نباشند.
const ownedBy = (context, query = {}) => ({ ...query, created_by_id: context.user.id });

export const listPatients = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator((input) => searchSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const query = ownedBy(context);
    if (data.search) {
      query.$or = [
        { full_name: { $regex: data.search, $options: "i" } },
        { file_number: { $regex: data.search, $options: "i" } },
      ];
    }
    // نزدیک‌ترین موعد پیگیری ابتدای فهرست
    const page = await context
      .getBase44()
      .asServiceRole.entities.Patient.filter(query, { sort: "next_review_date", limit: 200 });
    return page.items ?? page;
  });

const patientSchema = z.object({
  full_name: z.string().min(1).max(120),
  file_number: z.string().max(40).optional(),
  age: z.number().min(0).max(130).optional().nullable(),
  sex: z.enum(["male", "female"]).optional().nullable(),
  ward: z.string().max(80).optional(),
  ward_type: z.enum(["icu", "general"]).optional(),
  bed: z.string().max(40).optional(),
  notes: z.string().max(500).optional(),
});

export const createPatient = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(patientSchema)
  .handler(({ data, context }) =>
    context.getBase44().entities.Patient.create({
      ...data,
      last_review_date: todayISO(),
      next_review_date: addDaysISO(reviewDaysFor(data.ward_type)),
    }),
  );

// بیمارانی که موعد پایش آن‌ها سررسید شده است
export const dueReviews = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const page = await context
      .getBase44()
      .asServiceRole.entities.Patient.filter(ownedBy(context, { next_review_date: { $lte: todayISO() } }), {
        sort: "next_review_date",
        limit: 50,
      });
    return page.items ?? page;
  });

export const getPatient = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data, context }) => {
    const patient = await context
      .getBase44()
      .asServiceRole.entities.Patient.get(data.id)
      .catch((error) => {
        if (error?.status === 404) return null;
        throw error;
      });
    return patient && patient.created_by_id === context.user.id ? patient : null;
  });

export const patientAssessments = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(z.object({ patientId: z.string() }))
  .handler(async ({ data, context }) => {
    const page = await context
      .getBase44()
      .asServiceRole.entities.Assessment.filter(ownedBy(context, { patient_id: data.patientId }), {
        sort: "-created_date",
        limit: 50,
      });
    return page.items ?? page;
  });

export const recentAssessments = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const page = await context
      .getBase44()
      .asServiceRole.entities.Assessment.filter(ownedBy(context), { sort: "-created_date", limit: 20 });
    return page.items ?? page;
  });

const assessmentSchema = z.object({
  patient_id: z.string().optional(),
  patient_name: z.string().max(120).optional(),
  file_number: z.string().max(40).optional(),
  ward_type: z.enum(["icu", "general"]).optional(),
  age: z.number().min(0).max(130).optional().nullable(),
  sex: z.enum(["male", "female"]).optional().nullable(),
  primary_disease: z.string().max(400).optional(),
  underlying_disease: z.string().max(400).optional(),
  medications: z.string().max(1000).optional(),
  weight: z.number().positive().max(500),
  height: z.number().positive().max(260),
  usual_weight: z.number().positive().max(500).optional().nullable(),
  weight_loss_percent: z.number().min(0).max(100).optional().nullable(),
  intake_reduction: z.enum(["none", "mild", "moderate", "severe"]).default("none"),
  disease_severity: z.number().min(0).max(3).default(0),
  abnormal_labs: z.string().max(2000).optional(),
  lab_files: z.array(z.string()).max(6).optional(),
  fever: z.boolean().default(false),
  drain: z.boolean().default(false),
  protocol_id: z.string().optional(),
  protocol_name: z.string().optional(),
  formula_id: z.string().optional(),
  formula_name: z.string().optional(),
  bmi: z.number().optional(),
  ideal_weight: z.number().optional(),
  nrs_score: z.number().optional(),
  nrs_level: z.string().optional(),
  calorie_target: z.number().optional(),
  protein_target: z.number().optional(),
  fluid_target: z.number().optional(),
  result: z.record(z.string(), z.any()).optional(),
  record_note: z.string().max(4000).optional(),
  national_id: z.string().max(20).optional(),
  ward: z.string().max(80).optional(),
  room: z.string().max(40).optional(),
  bed: z.string().max(40).optional(),
  physician: z.string().max(120).optional(),
  father_name: z.string().max(120).optional(),
  birth_date: z.string().max(24).optional(),
  admission_date: z.string().max(24).optional(),
  pregnancy_status: z.string().max(20).optional(),
  activity_level: z.string().max(20).optional(),
  supplement_history: z.string().max(600).optional(),
  allergy: z.string().max(400).optional(),
  diet_order: z.string().max(400).optional(),
  nutrition_route: z.string().max(20).optional(),
  mac: z.number().min(0).max(100).optional().nullable(),
  skinfold: z.number().min(0).max(100).optional().nullable(),
  clinical_signs: z.array(z.string()).max(12).optional(),
  gi_symptoms: z.array(z.string()).max(12).optional(),
  diet_history: z.string().max(600).optional(),
  weight_change_duration: z.string().max(60).optional(),
});

export const saveAssessment = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(assessmentSchema)
  .handler(async ({ data, context }) => {
    const base44 = context.getBase44();
    const created = await base44.entities.Assessment.create(data);
    // با هر پایش تازه، موعد بعدی بیمار بازنویسی می‌شود
    if (data.patient_id) {
      await base44.entities.Patient.update(data.patient_id, {
        ward_type: data.ward_type,
        last_review_date: todayISO(),
        next_review_date: addDaysISO(reviewDaysFor(data.ward_type)),
      });
    }
    return created;
  });

export const deleteAssessment = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data, context }) => {
    await context.getBase44().entities.Assessment.delete(data.id);
    return { ok: true };
  });

// ---------- protocols & formulas ----------

export const listProtocols = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const base44 = context.getBase44();
    let page = await base44.entities.Protocol.list({ sort: "created_date", limit: 200 });
    let items = page.items ?? page;
    // پروتکل‌های جدید فقط اگر با همان نام ثبت نشده باشند اضافه می‌شوند (بدون رکورد تکراری)
    const names = new Set(items.map((p) => p.name));
    const missing = DEFAULT_PROTOCOLS.filter((p) => !names.has(p.name));
    if (missing.length) {
      await base44.entities.Protocol.bulkCreate(missing.map((p) => ({ ...p, is_default: true })));
      page = await base44.entities.Protocol.list({ sort: "created_date", limit: 200 });
      items = page.items ?? page;
    }
    return items;
  });

const protocolSchema = z.object({
  name: z.string().min(1).max(120),
  stress_factor: z.number().min(10).max(60),
  protein_per_kg: z.number().min(0.4).max(3),
  fluid_per_kg: z.number().min(15).max(60).optional(),
  fluid_cap: z.number().min(800).max(6000).optional(),
  notes: z.string().max(300).optional(),
  evidence: z.string().max(200).optional(),
  source_url: z.string().max(300).optional(),
});

export const createProtocol = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(protocolSchema)
  .handler(({ data, context }) => context.getBase44().entities.Protocol.create(data));

export const listFormulas = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const base44 = context.getBase44();
    let page = await base44.entities.Formula.list({ sort: "created_date", limit: 200 });
    let items = page.items ?? page;

    // فرمولاهای پیش‌فرض قدیمی (خارجی) حذف می‌شوند؛ فرمولاهای دستی کاربر دست‌نخورده می‌مانند
    const keep = new Set(DEFAULT_FORMULAS.map((f) => f.name));
    const legacy = items.filter((f) => f.is_default && !keep.has(f.name));
    if (legacy.length) {
      for (const f of legacy) await base44.entities.Formula.delete(f.id);
      page = await base44.entities.Formula.list({ sort: "created_date", limit: 200 });
      items = page.items ?? page;
    }

    const names = new Set(items.map((f) => f.name));
    const missing = DEFAULT_FORMULAS.filter((f) => !names.has(f.name));
    if (missing.length) {
      await base44.entities.Formula.bulkCreate(missing.map((f) => ({ ...f, is_default: true })));
      page = await base44.entities.Formula.list({ sort: "created_date", limit: 200 });
      items = page.items ?? page;
    }
    return items;
  });

const formulaSchema = z.object({
  name: z.string().min(1).max(120),
  manufacturer: z.string().max(80).optional(),
  kcal_per_ml: z.number().min(0.3).max(4),
  protein_per_100ml: z.number().min(0).max(20),
  category: z.string().max(60).optional(),
  notes: z.string().max(300).optional(),
});

export const createFormula = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(formulaSchema)
  .handler(({ data, context }) => context.getBase44().entities.Formula.create(data));

// ---------- منابع علمی ----------

export const listSources = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const base44 = context.getBase44();
    let page = await base44.entities.Source.list({ sort: "-created_date", limit: 100 });
    let items = page.items ?? page;
    // منابع دانش پایه (ESPEN و تداخل غذا–دارو) با عنوان یکتا فقط یک‌بار ثبت می‌شوند
    const titles = new Set(items.map((s) => s.title));
    const missing = SEED_SOURCES.filter((s) => !titles.has(s.title));
    if (missing.length) {
      await base44.entities.Source.bulkCreate(missing);
      page = await base44.entities.Source.list({ sort: "-created_date", limit: 100 });
      items = page.items ?? page;
    }
    return items;
  });

const sourceSchema = z.object({
  title: z.string().min(1).max(200),
  authors: z.string().max(200).optional(),
  year: z.number().min(1900).max(2100).optional().nullable(),
  kind: z.enum(["guideline", "textbook", "paper", "protocol", "other"]).optional(),
  publisher: z.string().max(160).optional(),
  url: z.string().max(500).optional(),
  key_points: z.string().max(2000).optional(),
  reviewed_on: z.string().max(20).optional(),
  file_uri: z.string().max(500).optional(),
});

export const createSource = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(sourceSchema)
  .handler(({ data, context }) => context.getBase44().entities.Source.create(data));

export const deleteSource = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data, context }) => {
    await context.getBase44().entities.Source.delete(data.id);
    return { ok: true };
  });

// ---------- lab sheet extraction ----------

const LAB_SCHEMA = {
  type: "object",
  properties: {
    labs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          value: { type: "string" },
          unit: { type: "string" },
          reference: { type: "string" },
          abnormal: { type: "boolean" },
        },
        required: ["name", "value"],
      },
    },
  },
  required: ["labs"],
};

export const extractLabs = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ fileUrl: z.string().min(10).max(2000) }))
  .handler(async ({ data, context }) => {
    const res = await context.getBase44().asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
      file_url: data.fileUrl,
      json_schema: LAB_SCHEMA,
    });
    if (res?.status !== "success") return { labs: [], error: res?.details || "استخراج ناموفق" };
    return { labs: res.output?.labs ?? [], error: null };
  });

// ---------- the 10-item plan ----------

const planInput = assessmentSchema
  .pick({
    patient_name: true,
    age: true,
    sex: true,
    primary_disease: true,
    underlying_disease: true,
    medications: true,
    weight: true,
    height: true,
    weight_loss_percent: true,
    intake_reduction: true,
    disease_severity: true,
    abnormal_labs: true,
    fever: true,
    drain: true,
    protocol_name: true,
  })
  .extend({ stress_factor: z.number().optional(), protein_per_kg: z.number().optional() });

const PLAN_JSON = {
  type: "object",
  properties: {
    required_labs: { type: "array", items: { type: "string" } },
    supplement: { type: "string" },
    drug_interactions: { type: "array", items: { type: "string" } },
    diet_principles: { type: "array", items: { type: "string" } },
    record_note: { type: "string" },
  },
  required: ["required_labs", "supplement", "drug_interactions", "diet_principles", "record_note"],
};

export const buildPlan = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(planInput)
  .handler(async ({ data, context }) => {
    const bmiValue = bmi(data.weight, data.height);
    const ibw = idealWeight(data.height);
    const nrs = computeNrs({
      bmiValue,
      weightLossPercent: data.weight_loss_percent,
      intakeReduction: data.intake_reduction,
      diseaseSeverity: data.disease_severity,
      age: data.age,
    });
    const targets = computeTargets({
      weight: data.weight,
      height: data.height,
      protocol: { stress_factor: data.stress_factor, protein_per_kg: data.protein_per_kg },
      fever: data.fever,
      drain: data.drain,
    });
    const category = bmiCategory(bmiValue);

    // دانش پایه کتابخانه: راهنمای ریزمغذی ESPEN مبنای بند مکمل، منابع تداخل مبنای بند تداخل
    const sourcePage = await context.getBase44().entities.Source.list({ sort: "-created_date", limit: 30 });
    const sources = (sourcePage.items ?? sourcePage).filter((s) => s.title);
    const line = (s) => `- ${s.title}${s.year ? ` (${s.year})` : ""}${s.key_points ? `: ${s.key_points}` : ""}`;
    const isMicro = (s) => /micronutrient|ریزمغذی/i.test(`${s.title} ${s.key_points || ""}`);
    const isInteraction = (s) => /تداخل/.test(`${s.title} ${s.key_points || ""}`);
    const microContext = sources.filter(isMicro).map(line).join("\n");
    const interactionContext = sources
      .filter((s) => isInteraction(s) && !isMicro(s))
      .map(line)
      .join("\n");
    const otherContext = sources
      .filter((s) => !isMicro(s) && !isInteraction(s))
      .map(line)
      .join("\n");

    const prompt = `تو کارشناس ارشد تغذیه بالینی هستی. بر اساس Krause's Food & Nutrition Care، ASPEN و ESPEN پاسخ بده.
${microContext ? `دانش پایه ریزمغذی‌ها و مکمل‌ها (مبنای بند مکمل؛ دوز و واحد را از همین دانش پایه بگیر):\n${microContext}\n` : ""}
${interactionContext ? `دانش پایه تداخل غذا–دارو (مبنای بند تداخل):\n${interactionContext}\n` : ""}
${otherContext ? `سایر منابع کتابخانه (توصیه‌ها باید با این منابع هم‌راستا باشد):\n${otherContext}\n` : ""}
بیمار: ${data.patient_name || "بدون نام ثبت‌شده"} | ${data.age ? data.age + " سال" : "سن نامشخص"} | ${data.sex === "female" ? "زن" : data.sex === "male" ? "مرد" : "جنسیت نامشخص"}
بیماری اصلی: ${data.primary_disease || "ذکر نشده"}
بیماری زمینه‌ای: ${data.underlying_disease || "ندارد"}
داروها: ${data.medications || "ندارد"}
وزن ${data.weight} kg، قد ${data.height} cm، BMI ${bmiValue} (${category.label})، وزن ایده‌آل ${ibw} kg، کاهش وزن ${data.weight_loss_percent || 0}٪، کاهش دریافت: ${data.intake_reduction}
آزمایش‌های غیرنرمال: ${data.abnormal_labs || "ذکر نشده"}
پروتکل انتخابی: ${data.protocol_name || "عمومی"} | NRS-2002 = ${nrs.total} (${nrs.level})
محاسبات قطعی (تغییر نده): انرژی ${targets.calorie} kcal، پروتئین ${targets.protein} g، مایع ${targets.fluid} ml

پاسخ را فقط به صورت JSON فارسی و بسیار تلگرافی بده (بدون مقدمه، بدون توضیح تئوری):
- required_labs: حداکثر ۶ آزمایش/پارامتر ضروری برای پایش تغذیه‌ای این بیمار (هر آیتم کوتاه، با واحد نباشد).
- supplement: یک جمله کوتاه درباره مکمل/ONS/فرمولای مناسب (نوع، حجم و دفعات) و در صورت نیاز دوز ریزمغذی (ویتامین D، تیامین، روی، آهن، B12) با واحد — بر پایه دانش پایه ریزمغذی‌ها و فقط در حد پیشنهاد مشروط به قضاوت بالینی؛ یا «نیاز ندارد».
- drug_interactions: حداکثر ۴ تداخل ماژور غذا-دارو یا دارو-مکمل مرتبط با داروهای ذکرشده؛ هر آیتم به شکل «دارو ← تداخل ← اقدام» و در پایان منبع کوتاه در پرانتز. اگر به تداخلی مطمئن نیستی، آن را نساز.
- diet_principles: دقیقاً ۳ تا ۴ نکته کاربردی و اجرایی رژیم.
- record_note: متن رسمی پرونده‌ای در حداکثر ۲ پاراگراف کوتاه برای درج مستقیم در پرونده بیمار، با اعداد و اهداف محاسبه‌شده.`;

    const llm = await context
      .getBase44()
      .asServiceRole.integrations.Core.InvokeLLM({ prompt, response_json_schema: PLAN_JSON });

    return {
      bmiValue,
      bmiLabel: category.label,
      bmiTone: category.tone,
      ibw,
      nrs,
      calorie: targets.calorie,
      protein: targets.protein,
      fluid: targets.fluid,
      required_labs: llm?.required_labs ?? [],
      supplement: llm?.supplement ?? "",
      drug_interactions: llm?.drug_interactions ?? [],
      diet_principles: llm?.diet_principles ?? [],
      record_note: llm?.record_note ?? "",
      sources: sources.map((s) => s.title),
    };
  });

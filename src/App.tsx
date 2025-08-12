import React, { useEffect, useMemo, useState } from "react";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-white/70 backdrop-blur rounded-2xl shadow p-4 md:p-6 space-y-4">
    <h2 className="text-xl md:text-2xl font-semibold tracking-tight">{title}</h2>
    {children}
  </div>
);

const Field = ({
  label,
  suffix,
  value,
  onChange,
  type = "number",
  placeholder,
}: {
  label: string;
  suffix?: string;
  value: string | number | undefined;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) => (
  <label className="flex items-center justify-between gap-3 py-2">
    <div className="text-sm md:text-base font-medium text-gray-800 w-1/2">{label}</div>
    <div className="flex items-center gap-2 w-1/2">
      <input
        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-right focus:outline-none focus:ring focus:ring-indigo-200"
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {suffix ? <span className="text-gray-500 text-sm min-w-10 text-right">{suffix}</span> : null}
    </div>
  </label>
);

function clampNum(n: any): number | undefined {
  const x = Number(n);
  return Number.isFinite(x) ? x : undefined;
}

function toFixedOrDash(x?: number, digits = 2) {
  return Number.isFinite(x as number) ? (x as number).toFixed(digits) : "–";
}

// Types
type HemoInputs = {
  sex: "M" | "F" | "";
  heightCm?: string;
  weightKg?: string;
  hb?: string;
  hr?: string;
  sbp?: string;
  dbp?: string;
  cvp?: string;
  pasp?: string;
  padp?: string;
  pcwp?: string;
  sao2?: string; // arterial O2 sat %
  svo2?: string; // mixed venous O2 sat %
};

type DripInputs = {
  weightKg?: string;
  mgInBag?: string; // mg
  volumeMl?: string; // mL
  rateMlHr?: string; // mL/hr
  targetDose?: string; // mcg/kg/min
};

const defaultHemo: HemoInputs = { sex: "" };
const defaultDrip: DripInputs = {};

// Hemodynamic calculations
function useHemodynamics(state: HemoInputs) {
  const { heightCm, weightKg, hb, hr, sbp, dbp, cvp, pasp, padp, pcwp, sao2, svo2 } = state;

  const bsa = useMemo(() => {
    const h = clampNum(heightCm);
    const w = clampNum(weightKg);
    if (!h || !w) return undefined;
    return Math.sqrt((h * w) / 3600);
  }, [heightCm, weightKg]);

  const map = useMemo(() => {
    const s = clampNum(sbp);
    const d = clampNum(dbp);
    if (!s || !d) return undefined;
    return d + (s - d) / 3;
  }, [sbp, dbp]);

  const mPAP = useMemo(() => {
    const ps = clampNum(pasp);
    const pd = clampNum(padp);
    if (!ps || !pd) return undefined;
    return (ps + 2 * pd) / 3;
  }, [pasp, padp]);

  const caO2 = useMemo(() => {
    const H = clampNum(hb);
    const Sa = clampNum(sao2);
    if (!H || !Sa) return undefined;
    return 1.34 * H * (Sa / 100);
  }, [hb, sao2]);

  const cvO2 = useMemo(() => {
    const H = clampNum(hb);
    const Sv = clampNum(svo2);
    if (!H || !Sv) return undefined;
    return 1.34 * H * (Sv / 100);
  }, [hb, svo2]);

  const vo2 = useMemo(() => {
    if (!bsa) return undefined;
    return 125 * bsa; // mL/min estimated
  }, [bsa]);

  const co = useMemo(() => {
    if (vo2 == null || caO2 == null || cvO2 == null) return undefined;
    const delta = caO2 - cvO2; // mL O2/dL
    if (delta <= 0) return undefined;
    return vo2 / (delta * 10); // L/min
  }, [vo2, caO2, cvO2]);

  const ci = useMemo(() => {
    if (co == null || bsa == null || bsa === 0) return undefined;
    return co / bsa;
  }, [co, bsa]);

  const sv = useMemo(() => {
    const C = co;
    const H = clampNum(hr);
    if (!C || !H || H === 0) return undefined;
    return (C * 1000) / H; // mL/beat
  }, [co, hr]);

  const svr = useMemo(() => {
    const M = map;
    const C = co;
    const Cv = clampNum(cvp);
    if (M == null || C == null || Cv == null || C === 0) return undefined;
    return (80 * (M - Cv)) / C;
  }, [map, co, cvp]);

  const pvr = useMemo(() => {
  if (mPAP == null || co == null || pcwp == null || co === 0) return undefined;
  return (80 * (mPAP - pcwp)) / co;
}, [mPAP, co, pcwp]);

// PVR in Wood Units
const pvrWU = useMemo(() => {
  if (mPAP == null || co == null || pcwp == null || co === 0) return undefined;
  return (mPAP - pcwp) / co;
}, [mPAP, co, pcwp]);
}

// Drip calculator
function calcDose({ mgInBag, volumeMl, rateMlHr, weightKg }: { mgInBag?: number; volumeMl?: number; rateMlHr?: number; weightKg?: number; }) {
  const mgPerMl = mgInBag && volumeMl ? mgInBag / volumeMl : undefined;
  if (!mgPerMl || !rateMlHr || !weightKg || mgPerMl <= 0 || weightKg <= 0) return undefined;
  return (rateMlHr * (mgPerMl * 1000)) / (60 * weightKg);
}

function calcRate({ mgInBag, volumeMl, doseMcgKgMin, weightKg }: { mgInBag?: number; volumeMl?: number; doseMcgKgMin?: number; weightKg?: number; }) {
  const mgPerMl = mgInBag && volumeMl ? mgInBag / volumeMl : undefined;
  if (!mgPerMl || !doseMcgKgMin || !weightKg || mgPerMl <= 0 || weightKg <= 0) return undefined;
  return (doseMcgKgMin * 60 * weightKg) / (mgPerMl * 1000);
}

const Card = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-gray-200 shadow-sm p-4 md:p-6 bg-white/80">{children}</div>
);

function Metric({ label, value, unit, digits = 2 }: { label: string; value?: number; unit?: string; digits?: number; }) {
  return (
    <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
      <div className="text-xs uppercase tracking-wide text-gray-600">{label}</div>
      <div className="text-lg md:text-xl font-semibold">{toFixedOrDash(value, digits)}{unit ? ` ${unit}` : ""}</div>
    </div>
  );
}

function LabelValue({ label, value, suffix }: { label: string; value: string | number; suffix?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-700">{label}</span>
      <span className="text-base font-semibold">{value}{suffix}</span>
    </div>
  );
}

function exampleRate(mg:number, vol:number, dose:number, kg:number){
  const r = calcRate({ mgInBag: mg, volumeMl: vol, doseMcgKgMin: dose, weightKg: kg });
  return r ? r.toFixed(2) : "–";
}

export default function App() {
  const [tab, setTab] = useState<"hemo" | "drip">("hemo");
  const [hemo, setHemo] = useState<HemoInputs>(() => {
    try {
      const saved = localStorage.getItem("ccu_hemo_v1");
      return saved ? { ...defaultHemo, ...JSON.parse(saved) } : defaultHemo;
    } catch {
      return defaultHemo;
    }
  });
  const [drip, setDrip] = useState<DripInputs>(() => {
    try {
      const saved = localStorage.getItem("ccu_drip_v1");
      return saved ? { ...defaultDrip, ...JSON.parse(saved) } : defaultDrip;
    } catch {
      return defaultDrip;
    }
  });

  useEffect(() => {
    localStorage.setItem("ccu_hemo_v1", JSON.stringify(hemo));
  }, [hemo]);
  useEffect(() => {
    localStorage.setItem("ccu_drip_v1", JSON.stringify(drip));
  }, [drip]);

  const results = useHemodynamics(hemo);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-indigo-50 to-white text-gray-900">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">CCU Rounder</h1>
          <div className="inline-flex rounded-2xl bg-gray-100 p-1">
            <button
              onClick={() => setTab("hemo")}
              className={`px-3 py-1.5 text-sm rounded-xl ${tab === "hemo" ? "bg-white shadow" : "text-gray-600"}`}
            >Hemodynamics</button>
            <button
              onClick={() => setTab("drip")}
              className={`px-3 py-1.5 text-sm rounded-xl ${tab === "drip" ? "bg-white shadow" : "text-gray-600"}`}
            >Drip Calc</button>
          </div>
        </header>

        {tab === "hemo" ? (
          <Section title="Hemodynamic Interpreter (Fick estimate)">
            <p className="text-sm text-gray-600">Enter what you have; missing values are okay. Oxygen-based CO uses Fick with estimated VO₂ = 125 × BSA. Dissolved O₂ is ignored.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <div className="text-base font-semibold mb-2">Patient Inputs</div>
                <div className="space-y-1">
                  <label className="flex items-center justify-between gap-3 py-2">
                    <span className="text-sm font-medium text-gray-800 w-1/2">Sex</span>
                    <select
                      className="w-1/2 rounded-xl border border-gray-300 px-3 py-2 text-right bg-white"
                      value={hemo.sex}
                      onChange={(e) => setHemo({ ...hemo, sex: e.target.value as any })}
                    >
                      <option value="">–</option>
                      <option value="M">M</option>
                      <option value="F">F</option>
                    </select>
                  </label>
                  <Field label="Height" suffix="cm" value={hemo.heightCm} onChange={(v)=>setHemo({...hemo,heightCm:v})} />
                  <Field label="Weight" suffix="kg" value={hemo.weightKg} onChange={(v)=>setHemo({...hemo,weightKg:v})} />
                  <Field label="Hemoglobin" suffix="g/dL" value={hemo.hb} onChange={(v)=>setHemo({...hemo,hb:v})} />
                  <Field label="Heart Rate" suffix="bpm" value={hemo.hr} onChange={(v)=>setHemo({...hemo,hr:v})} />
                </div>
              </Card>

              <Card>
                <div className="text-base font-semibold mb-2">Pressures</div>
                <div className="space-y-1">
                  <Field label="SBP" suffix="mmHg" value={hemo.sbp} onChange={(v)=>setHemo({...hemo,sbp:v})} />
                  <Field label="DBP" suffix="mmHg" value={hemo.dbp} onChange={(v)=>setHemo({...hemo,dbp:v})} />
                  <Field label="CVP" suffix="mmHg" value={hemo.cvp} onChange={(v)=>setHemo({...hemo,cvp:v})} />
                  <Field label="PASP" suffix="mmHg" value={hemo.pasp} onChange={(v)=>setHemo({...hemo,pasp:v})} />
                  <Field label="PADP" suffix="mmHg" value={hemo.padp} onChange={(v)=>setHemo({...hemo,padp:v})} />
                  <Field label="PCWP" suffix="mmHg" value={hemo.pcwp} onChange={(v)=>setHemo({...hemo,pcwp:v})} />
                </div>
              </Card>

              <Card>
                <div className="text-base font-semibold mb-2">Oxygenation</div>
                <div className="space-y-1">
                  <Field label="SaO₂ (arterial)" suffix="%" value={hemo.sao2} onChange={(v)=>setHemo({...hemo,sao2:v})} />
                  <Field label="SvO₂ (mixed venous)" suffix="%" value={hemo.svo2} onChange={(v)=>setHemo({...hemo,svo2:v})} />
                </div>
              </Card>

              <Card>
                <div className="text-base font-semibold mb-2">Derived (auto)</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-2 rounded-lg bg-gray-50">BSA (Mosteller)<div className="text-lg font-semibold">{toFixedOrDash(results.bsa,2)} m²</div></div>
                  <div className="p-2 rounded-lg bg-gray-50">MAP<div className="text-lg font-semibold">{toFixedOrDash(results.map,1)} mmHg</div></div>
                  <div className="p-2 rounded-lg bg-gray-50">mPAP<div className="text-lg font-semibold">{toFixedOrDash(results.mPAP,1)} mmHg</div></div>
                  <div className="p-2 rounded-lg bg-gray-50">CaO₂<div className="text-lg font-semibold">{toFixedOrDash(results.caO2,2)} mL/dL</div></div>
                  <div className="p-2 rounded-lg bg-gray-50">CvO₂<div className="text-lg font-semibold">{toFixedOrDash(results.cvO2,2)} mL/dL</div></div>
                  <div className="p-2 rounded-lg bg-gray-50">VO₂ (est.)<div className="text-lg font-semibold">{toFixedOrDash(results.vo2,0)} mL/min</div></div>
                </div>
              </Card>
            </div>

            <Card>
              <div className="text-base font-semibold mb-3">Outputs</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Metric label="Cardiac Output" value={results.co} unit="L/min" digits={2} />
                <Metric label="Cardiac Index" value={results.ci} unit="L/min/m²" digits={2} />
                <Metric label="Stroke Volume" value={results.sv} unit="mL/beat" digits={0} />
                <Metric label="SVR" value={results.svr} unit="dyn·s·cm⁻⁵" digits={0} />
                <Metric label="PVR" value={results.pvrWU} unit="WU" digits={2} />

              </div>
              <p className="text-xs text-gray-500 mt-3">Notes: SVR uses MAP−CVP; PVR uses mPAP−PCWP. Fick assumes VO₂ = 125×BSA. For accuracy, enter measured VO₂ when available (future update).</p>
            </Card>
          </Section>
        ) : (
          <Section title="Vasopressor / Inotrope Drip Calculator">
            <p className="text-sm text-gray-600">Bidirectional: compute dose from rate or compute rate from desired dose.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <div className="text-base font-semibold mb-2">Bag / Patient</div>
                <div className="space-y-1">
                  <Field label="Patient weight" suffix="kg" value={drip.weightKg} onChange={(v)=>setDrip({...drip,weightKg:v})} />
                  <Field label="Drug in bag" suffix="mg" value={drip.mgInBag} onChange={(v)=>setDrip({...drip,mgInBag:v})} />
                  <Field label="Diluent volume" suffix="mL" value={drip.volumeMl} onChange={(v)=>setDrip({...drip,volumeMl:v})} />
                </div>
                <div className="text-xs text-gray-500 mt-2">Example: Norepinephrine 4 mg in 250 mL.</div>
              </Card>

              <Card>
                <div className="text-base font-semibold mb-2">From rate → dose</div>
                <Field label="Infusion rate" suffix="mL/hr" value={drip.rateMlHr} onChange={(v)=>setDrip({...drip,rateMlHr:v})} />
                <div className="mt-3 p-3 rounded-xl bg-gray-50">
                  <LabelValue label="Dose" value={toFixedOrDash(calcDose({
                    mgInBag: clampNum(drip.mgInBag),
                    volumeMl: clampNum(drip.volumeMl),
                    rateMlHr: clampNum(drip.rateMlHr),
                    weightKg: clampNum(drip.weightKg),
                  }),3)} suffix=" mcg/kg/min" />
                </div>
              </Card>

              <Card>
                <div className="text-base font-semibold mb-2">From target dose → rate</div>
                <Field label="Target dose" suffix="mcg/kg/min" value={drip.targetDose} onChange={(v)=>setDrip({...drip,targetDose:v})} />
                <div className="mt-3 p-3 rounded-xl bg-gray-50">
                  <LabelValue label="Required rate" value={toFixedOrDash(calcRate({
                    mgInBag: clampNum(drip.mgInBag),
                    volumeMl: clampNum(drip.volumeMl),
                    doseMcgKgMin: clampNum(drip.targetDose),
                    weightKg: clampNum(drip.weightKg),
                  }),2)} suffix=" mL/hr" />
                </div>
              </Card>

              <Card>
                <div className="text-base font-semibold mb-2">Quick Example</div>
                <p className="text-sm text-gray-700">“Levo 4 mg in 250 mL, target 0.3 mcg/kg/min at 70 kg” → Rate ≈ <strong>{exampleRate(4,250,0.3,70)} mL/hr</strong></p>
              </Card>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white shadow hover:opacity-90"
                onClick={() => { 
                  setHemo(defaultHemo); 
                  setDrip(defaultDrip); 
                  localStorage.removeItem("ccu_hemo_v1"); 
                  localStorage.removeItem("ccu_drip_v1"); 
                }}
              >Clear all</button>
            </div>
          </Section>
        )}

        <footer className="text-xs text-gray-500 pt-2">
          CCU Rounder • Educational use only. Verify against clinical standards & pump programming guidelines.
        </footer>
      </div>
    </div>
  );
}

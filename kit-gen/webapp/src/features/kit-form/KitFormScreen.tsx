import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormProvider, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { briefFilled } from "@/features/kitfile";
import { BriefPasteDialog } from "./components/BriefPasteDialog";
import { StepHeader } from "./components/StepHeader";
import { DEFAULT_VALUES, briefToForm, kitFormSchema, type KitFormValues } from "./lib/form-model";
import { buildStylePrompt } from "./lib/style-phrases";
import { StylePage } from "./pages/StylePage";
import { ScopePage } from "./pages/ScopePage";
import { ReviewPage } from "./pages/ReviewPage";
import { StartDrawingButton } from "./components/StartDrawingButton";
import { buildContract } from "./lib/form-to-contract";
import { SubjectPage } from "./pages/SubjectPage";
export function KitFormScreen({ projectId, initialValues, onExit, onContinue }: { projectId?: string; initialValues?: Partial<KitFormValues>; onExit?: () => void; onContinue?: (values: KitFormValues) => void }) {
  const form = useForm<KitFormValues>({ resolver: zodResolver(kitFormSchema), defaultValues: { ...DEFAULT_VALUES, ...initialValues } });
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1); const [briefOpen, setBriefOpen] = useState(false); const [notice, setNotice] = useState(""); const [promptEdited, setPromptEdited] = useState(false);
  const style = form.watch("style");
  useEffect(() => { if (!promptEdited) form.setValue("stylePrompt", buildStylePrompt(style)); }, [form, promptEdited, style]);
  const values = form.watch(); const contract = buildContract(values);
  const next = form.handleSubmit((submitted) => { if (step < 4) setStep((step + 1) as 1 | 2 | 3 | 4); else onContinue?.(submitted); });
  return <FormProvider {...form}><main className="min-h-screen bg-canvas"><StepHeader step={step}/><div className="kg-page flex min-h-[calc(100vh-73px)] flex-col py-8 sm:py-12"><div className="mb-6 flex items-center justify-between gap-3"><Button type="button" variant="ghost" onClick={onExit}>← Thoát</Button>{step === 1 && <Button type="button" variant="secondary" onClick={() => setBriefOpen(true)}>Dán brief</Button>}</div>{notice && <p role="status" className="mb-5 rounded-2 border border-accent/60 bg-accent/[var(--kg-tint-b)] p-3 text-body text-fg">{notice}</p>}<form onSubmit={next} className="flex flex-1 flex-col"><div className="flex-1">{step === 1 ? <SubjectPage projectId={projectId}/> : step === 2 ? <StylePage promptEdited={promptEdited} onPromptEdit={() => setPromptEdited(true)}/> : step === 3 ? <ScopePage/> : <ReviewPage values={values} contract={contract} onEdit={() => setStep(1)} />}</div><footer className="mt-8 flex justify-end gap-3 border-t border-line-subtle pt-5">{step > 1 && <Button type="button" variant="ghost" onClick={() => setStep((step - 1) as 1 | 2 | 3 | 4)}>Quay lại</Button>}{step < 4 ? <Button type="submit" variant="primary">Tiếp theo</Button> : <StartDrawingButton values={values} contract={contract} projectId={projectId}/>}</footer></form></div></main><BriefPasteDialog open={briefOpen} onOpenChange={setBriefOpen} onApply={(result, counts) => { const patch = briefToForm(result); for (const [key, value] of Object.entries(patch)) form.setValue(key as keyof KitFormValues, value as never); setNotice(briefFilled(counts.filled, counts.unsure)); }}/></FormProvider>;
}

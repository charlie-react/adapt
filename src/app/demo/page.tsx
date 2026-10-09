import Link from "next/link";
import { LessonWorkspace } from "@/components/lesson-workspace";
import { SourceLesson } from "@/lib/fixtures/binary-tree-source";
import { createLesson } from "@/lib/fixtures/binary-tree";
import { Readable } from "@/components/read-aloud";

export default function Demo() {
  const material = createLesson();
  return <><main id="main" tabIndex={-1}>
    <p><Link href="/">Upload your own material</Link></p>
    <Readable label="Introduction" units={["Change the way you learn.", "Explore one lesson through another representation, then demonstrate the same knowledge."]}><div className="intro"><p className="eyebrow">A different way to engage. The same learning goal.</p><h1>Change the way you learn.</h1><p>Explore one lesson through another representation, then demonstrate the same knowledge.</p></div></Readable>
    <section className="objective panel" aria-labelledby="objective-title" id="source-objective" tabIndex={-1}>
      <p className="eyebrow">Your learning goal</p><Readable label="Learning objective" units={["Learning objective.", material.objectives[0].text]}><h2 id="objective-title">What you will demonstrate</h2><p>{material.objectives[0].text}</p></Readable>
    </section>
    <SourceLesson material={material} />
    <LessonWorkspace materialId={material.id} barrier={{ id: "visual-diagram-interpretation", label: "I have difficulty independently interpreting visual diagrams" }} />
  </main><footer>ADAPT changes the way learning happens, not what the learner is expected to learn.</footer></>;
}

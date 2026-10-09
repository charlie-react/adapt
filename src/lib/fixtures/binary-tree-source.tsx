import { Readable } from "@/components/read-aloud";
import type { LearningMaterial } from "@/lib/engine/types";
import { canonicalTree, visualTree, spokenNode } from "@/lib/fixtures/binary-tree";

// Only this fixture renderer knows how a binary tree is drawn.
export function SourceLesson({ material }: { material: LearningMaterial }) {
  const drawing = visualTree(canonicalTree);
  return <section aria-labelledby="source-title" className="panel">
    <p className="eyebrow">01 / Explore the lesson</p>
    <Readable label="Lesson introduction" units={[material.title, "Explore the diagram and read how each node connects to the others."]}><h2 id="source-title">{material.title}</h2>
    <p>Explore the diagram and read how each node connects to the others.</p></Readable>
    <Readable label="Diagram relationships" units={["Binary-tree diagram.", ...canonicalTree.nodes.flatMap(node => spokenNode(canonicalTree, node))]}><figure>
      <svg role="img" aria-labelledby="diagram-title diagram-description" viewBox={`0 0 ${drawing.width} ${drawing.height}`} className="diagram">
        <title id="diagram-title">Binary-tree diagram</title>
        <desc id="diagram-description">The complete parent and left/right child relationships are described below.</desc>
        {drawing.edges.map((edge) => {
          const from = drawing.positions.find((point) => point.id === edge.from)!;
          const to = drawing.positions.find((point) => point.id === edge.to)!;
          return <line key={`${edge.from}-${edge.to}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="currentColor" strokeWidth="2" />;
        })}
        {drawing.positions.map((point) => <g key={point.id}>
          <circle cx={point.x} cy={point.y} r="22" fill="var(--surface)" stroke="currentColor" strokeWidth="2" />
          <text x={point.x} y={point.y + 6} textAnchor="middle" fill="currentColor" fontSize="18">{point.id}</text>
        </g>)}
      </svg>
      <figcaption>Lines connect parents to their children; empty child positions have no node.</figcaption>
    </figure></Readable>
    <h3>Node relationships</h3>
    <ul className="source-list">
      {material.segments.filter((segment) => segment.id !== "objective").map((segment) => <li id={`source-${segment.id}`} key={segment.id} tabIndex={-1}>
        <Readable label={segment.title} language={material.language} units={canonicalTree.nodes.some(node => `node-${node.id}` === segment.id) ? spokenNode(canonicalTree, canonicalTree.nodes.find(node => `node-${node.id}` === segment.id)!) : [segment.title, segment.text]}><strong>{segment.title}</strong><p>{segment.text}</p></Readable>
      </li>)}
    </ul>
  </section>;
}

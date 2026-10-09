export function SourceLinks({ ids }: { ids: string[] }) {
  return <p className="source-links">Source: {ids.map((id, index) => <span key={id}>{index > 0 && ", "}<a href={`#source-${id}`}>{id === "definitions" ? "Key ideas" : id === "objective" ? "Learning objective" : id.replace("node-", "Node ")}</a></span>)}</p>;
}

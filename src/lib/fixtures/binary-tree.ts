import type { AccessibleExperience, LearningMaterial, MaterialAdapter, Objective, PracticeQuestion } from "../engine/types";

export type TreeNode = { id: string; left: string | null; right: string | null };
export type BinaryTree = { root: string; nodes: TreeNode[] };
export const canonicalTree: BinaryTree = {
  root: "A",
  nodes: [
    { id: "A", left: "B", right: "C" },
    { id: "B", left: "D", right: "E" },
    { id: "C", left: null, right: "F" },
    { id: "D", left: null, right: null },
    { id: "E", left: null, right: null },
    { id: "F", left: null, right: null },
  ],
};
export const objective: Objective = {
  id: "identify-tree-relationships",
  text: "Identify the root node, parent/child relationships, and leaf nodes of a binary tree.",
  authority: "source-explicit",
  sourceIds: ["objective"],
};

export function validateTree(tree: BinaryTree): void {
  if (!tree.nodes.length) throw new Error("Empty tree");
  const nodes = new Map(tree.nodes.map((node) => [node.id, node]));
  if (nodes.size !== tree.nodes.length || !nodes.has(tree.root)) throw new Error("Duplicate nodes or missing root");
  const parents = new Map<string, number>();
  for (const node of tree.nodes) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(node.id)) throw new Error("Invalid node ID");
    for (const child of [node.left, node.right]) {
      if (child === null) continue;
      if (!nodes.has(child) || child === node.id) throw new Error("Invalid child reference");
      parents.set(child, (parents.get(child) ?? 0) + 1);
    }
  }
  if (parents.has(tree.root) || tree.nodes.some((node) => node.id !== tree.root && parents.get(node.id) !== 1)) {
    throw new Error("Invalid parent relationships");
  }
  const visited = new Set<string>();
  function visit(id: string) {
    if (visited.has(id)) throw new Error("Cycle");
    visited.add(id);
    const node = nodes.get(id)!;
    if (node.left) visit(node.left);
    if (node.right) visit(node.right);
  }
  visit(tree.root);
  if (visited.size !== tree.nodes.length) throw new Error("Disconnected tree");
}

export function describeNode(tree: BinaryTree, node: TreeNode): string[] {
  const parent = tree.nodes.find((candidate) => candidate.left === node.id || candidate.right === node.id);
  return [
    parent ? `Parent: ${parent.id}. ${node.id} is its ${parent.left === node.id ? "left" : "right"} child.` : `${node.id} is the root and has no parent.`,
    `Left child: ${node.left ?? "none"}.`,
    `Right child: ${node.right ?? "none"}.`,
    !node.left && !node.right ? `${node.id} is a leaf because it has no children.` : `${node.id} is not a leaf because it has children.`,
  ];
}

// Presentation-only descriptions from canonical relationships, never from AI or DOM.
export function spokenNode(tree: BinaryTree, node: TreeNode): string[] {
  const parent = tree.nodes.find(candidate => candidate.left === node.id || candidate.right === node.id);
  return [
    `This is Node ${node.id}.`,
    parent ? `${node.id} is the ${parent.left === node.id ? "left" : "right"} child of ${parent.id}.` : `${node.id} is the root and has no parent.`,
    node.left ? `${node.left} is the left child of ${node.id}.` : `${node.id} has no left child.`,
    node.right ? `${node.right} is the right child of ${node.id}.` : `${node.id} has no right child.`,
    !node.left && !node.right ? `${node.id} is a leaf because it has no children.` : `${node.id} is not a leaf because it has children.`,
  ];
}

export function createLesson(tree = canonicalTree): LearningMaterial {
  validateTree(tree);
  return {
    id: "binary-tree-demo", title: "Understanding a binary tree", language: "en", synthetic: true,
    objectives: [structuredClone(objective)],
    segments: [
      { id: "objective", title: "Learning objective", text: objective.text },
      { id: "definitions", title: "Key ideas", text: "A binary tree has at most two children per node: a left child and a right child. The root has no parent. A parent connects directly to its children. A leaf has no children. Left and right describe relationships, not alphabetical order." },
      ...tree.nodes.map((node) => ({ id: `node-${node.id}`, title: `Diagram: node ${node.id}`, text: describeNode(tree, node).join(" ") })),
    ],
  };
}

export function semanticTree(tree: BinaryTree, objectives: Objective[]): AccessibleExperience {
  validateTree(tree);
  return {
    title: "Explore the relationships",
    summary: "Choose a node to explore its parent and children. Left and right relationships are stated in words. You can return here while practising.",
    objectiveIds: objectives.map((item) => item.id),
    items: tree.nodes.map((node) => ({
      id: node.id, title: `Node ${node.id}`, facts: describeNode(tree, node), spokenStatements: spokenNode(tree, node), sourceIds: [`node-${node.id}`],
      related: [
        ...tree.nodes.filter((parent) => parent.left === node.id || parent.right === node.id).map((parent) => ({ itemId: parent.id, label: `Explore parent ${parent.id}` })),
        ...(node.left ? [{ itemId: node.left, label: `Explore left child ${node.left}` }] : []),
        ...(node.right ? [{ itemId: node.right, label: `Explore right child ${node.right}` }] : []),
      ],
    })),
  };
}

// Coordinates are derived from the same canonical edges as semantic conversion.
export function visualTree(tree: BinaryTree) {
  validateTree(tree);
  const nodes = new Map(tree.nodes.map((node) => [node.id, node]));
  const positions: { id: string; x: number; y: number }[] = [];
  let index = 0;
  function place(id: string, depth: number) {
    const node = nodes.get(id)!;
    if (node.left) place(node.left, depth + 1);
    positions.push({ id, x: 45 + index++ * 70, y: 35 + depth * 90 });
    if (node.right) place(node.right, depth + 1);
  }
  place(tree.root, 0);
  return {
    positions,
    edges: tree.nodes.flatMap((node) => [node.left, node.right].filter((child): child is string => child !== null).map((child) => ({ from: node.id, to: child }))),
    width: tree.nodes.length * 70 + 20,
    height: Math.max(...positions.map((point) => point.y)) + 40,
  };
}

export function practiceQuestions(objectives: Objective[]): PracticeQuestion[] {
  if (objectives.length !== 1 || objectives[0].id !== objective.id || objectives[0].text !== objective.text) throw new Error("Unexpected objective");
  const options = canonicalTree.nodes.map((node) => ({ id: node.id, label: `Node ${node.id}` }));
  return [
    { id: "root", prompt: "Which node is the root?", multiple: false, sourceIds: ["definitions", "node-A"] },
    { id: "parent", prompt: "Which node is the parent of E?", multiple: false, sourceIds: ["node-E"] },
    { id: "children", prompt: "Which nodes are the children of B? Select all that apply.", multiple: true, sourceIds: ["node-B"] },
    { id: "leaves", prompt: "Which nodes are leaves? Select all that apply.", multiple: true, sourceIds: ["definitions", "node-D", "node-E", "node-F"] },
  ].map((question) => ({ ...question, objectiveId: objective.id, options }));
}

export function respondToPractice(questionId: string, answers: string[]) {
  const questions = practiceQuestions([objective]);
  const question = questions.find((candidate) => candidate.id === questionId);
  if (!question || !answers.length || new Set(answers).size !== answers.length || answers.some((id) => !canonicalTree.nodes.some((node) => node.id === id)) || (!question.multiple && answers.length !== 1)) {
    throw new Error("Invalid practice response");
  }
  const expected: Record<string, string[]> = {
    root: [canonicalTree.root],
    parent: canonicalTree.nodes.filter((node) => node.left === "E" || node.right === "E").map((node) => node.id),
    children: canonicalTree.nodes.filter((node) => node.id === "B").flatMap((node) => [node.left, node.right].filter((id): id is string => id !== null)),
    leaves: canonicalTree.nodes.filter((node) => !node.left && !node.right).map((node) => node.id),
  };
  const matches = [...answers].sort().join(",") === expected[questionId].sort().join(",");
  const hints: Record<string, string> = {
    root: "The root has no parent. Explore node A and compare its parent relationship with another node.",
    parent: "A parent connects directly to its child. Explore E's parent relationship.",
    children: "Children connect directly to their parent. Explore B's left and right child relationships.",
    leaves: "A leaf has no children. Compare each node's left and right child relationships.",
  };
  return { questionId, message: matches ? "Your response is consistent with the source relationships. Explain why using the node details; you can practise again." : `Keep exploring and try again. ${hints[questionId]}`, sourceIds: question.sourceIds };
}

export const binaryTreeAdapter: MaterialAdapter = {
  ingest: createLesson,
  analyze: () => ({ concepts: ["root", "parent/child relationships", "leaf"], accessRequirements: ["interpret-visual-relationships"] }),
  strategies: [{
    id: "structured-relationships", barrier: "visual-diagram-interpretation", accessRequirement: "interpret-visual-relationships",
    explanation: "This lesson presents relationships visually. Your selected barrier makes that presentation difficult to access. Structured text states those same relationships; it does not change the learning objective.",
    sourceIds: ["definitions", ...canonicalTree.nodes.map((node) => `node-${node.id}`)],
    adapt: (material) => semanticTree(canonicalTree, material.objectives),
  }],
  practice: practiceQuestions,
  respond: respondToPractice,
};

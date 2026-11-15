/** One SVG child of an icon: tag name and attributes, e.g. `["path", { d: "M5 12h14" }]`. */
export type IconNodeChild = [tag: string, attrs: Record<string, string>];
/** The drawing data of one icon on lucide's 24 x 24 grid. */
export type IconNode = IconNodeChild[];

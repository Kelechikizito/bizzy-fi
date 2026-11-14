/** Markdown files import as their text (see the "*.md" rule in next.config.ts). */
declare module "*.md" {
  const text: string;
  export default text;
}

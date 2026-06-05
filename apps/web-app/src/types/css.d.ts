// Permite importar archivos CSS en TypeScript (Next.js los maneja nativo)
declare module '*.css' {
  const styles: { [className: string]: string };
  export default styles;
}

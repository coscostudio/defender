// Make Splide and GSAP globals available when loaded via CDN in Webflow
declare global {
  interface Window {
    gsap?: any;
    Splide?: any;
    splide?: { Extensions?: any };
  }
}
export {};

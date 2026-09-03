import type Splide, { type ComponentConstructor } from '@splidejs/splide';
import type gsap from 'gsap';

// Make Splide and GSAP globals available when loaded via CDN in Webflow
declare global {
  interface Window {
    gsap?: typeof gsap;
    Splide?: typeof Splide;
    splide?: { Extensions?: Record<string, ComponentConstructor> };
  }
}
export {};

import {plotBrand} from '../brand.js';
/** Static pages share the same identity without loading the React app. */
class PlotBrand extends HTMLElement{
  connectedCallback(){
    const image=this.querySelector('img')??document.createElement('img');
    image.src=plotBrand.logo;image.alt=plotBrand.label;
    image.width=plotBrand.width;image.height=plotBrand.height;
    if(!image.parentElement)this.append(image);
  }
}
if(!customElements.get('plot-brand'))customElements.define('plot-brand',PlotBrand);

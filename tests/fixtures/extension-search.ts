import {expect,type Page} from '@playwright/test';
export async function chooseChannel(page:Page,channel:string){
 const toggle=page.getByRole('button',{name:'Buscar canal',exact:true});
 await toggle.click();
 const input=page.getByRole('searchbox',{name:'Canal de Twitch',exact:true});
 await input.fill(channel);await input.press('Enter');
 await expect(page.locator('.channel-current')).toHaveText('@'+channel);
 await page.getByRole('button',{name:'Cerrar búsqueda',exact:true}).click();
}

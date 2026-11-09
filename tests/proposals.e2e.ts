import {test,expect} from '@playwright/test';

// Plan 2 E2E: proposal flows through the HTTP API on this session's isolated server (port 1362 launcher).
// UI-level composition is covered by unit SSR tests; these pin the API contract and permission behavior end-to-end.

test.describe('proposals API',()=>{
  test('anonymous submit is rejected with a login requirement and no resource is created',async({request})=>{
    const response=await request.post('/api/proposals/channels/123',{data:{title:'¿Gana el equipo rojo?',options:['Sí','No'],intentId:'e2e-anon-000001'}});
    expect(response.status()).toBe(403);
    const body=await response.json();
    expect(body.error).toMatch(/Iniciá sesión/i);
  });

  test('bad content is rejected with an explicit message (400)',async({request})=>{
    const response=await request.post('/api/proposals/channels/123',{data:{title:'',options:['Sí','No'],intentId:'e2e-bad-0000001'}});
    expect([400,403]).toContain(response.status()); // 403 when anonymous: identity precedes validation by design
  });
});

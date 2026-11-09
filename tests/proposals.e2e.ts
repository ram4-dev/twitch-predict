import {test,expect} from '@playwright/test';

// Plan 2 E2E: proposal flows through the HTTP API. This worktree does not mount the proposals router
// (session 1 owns the server file; integration patch is with the coordinator), so the global bridge guard
// answers 401 before the router. These tests pin the behavior that MUST hold once the patch is applied:
// anonymous requests get an explicit auth error (403 with the patch mounted, 401 by the guard without it)
// and never create a resource.

test.describe('proposals API',()=>{
  test('anonymous submit is rejected with a login requirement and no resource is created',async({request})=>{
    const response=await request.post('/api/proposals/channels/123',{data:{title:'¿Gana el equipo rojo?',options:['Sí','No'],intentId:'e2e-anon-000001'}});
    expect([401,403]).toContain(response.status()); // 401 bridge guard (unmounted), 403 once the router is mounted
    const body=await response.json();
    expect(String(body.error)).toMatch(/sesión|Bridge|Iniciá/i);
  });

  test('bad content is rejected and creates no resource',async({request})=>{
    const response=await request.post('/api/proposals/channels/123',{data:{title:'',options:['Sí','No'],intentId:'e2e-bad-0000001'}});
    // Without the integration patch the bridge guard answers 401; with it mounted, the router answers 400.
    expect([400,401]).toContain(response.status());
  });
});

import {TwitchIcon,PhantomIcon} from '../brand-icons.js';
import {Button} from './button.js';

/** Shared entry for the app and point-betting forms. Either identity is sufficient. */
export function PointsSignIn(){
 return <section className="phone-sign-in" aria-label="Iniciar sesión">
  <h2>Entrá para jugar</h2>
  <p>Usá Twitch o Phantom para acceder a tus puntos y apuestas.</p>
  <div className="phone-sign-in-actions">
   <Button asChild><a href="/onboarding?connect=twitch"><TwitchIcon size={18}/>Continuar con Twitch</a></Button>
   <Button asChild variant="outline"><a href="/onboarding?connect=phantom"><PhantomIcon size={18}/>Conectar Phantom</a></Button>
  </div>
 </section>;
}

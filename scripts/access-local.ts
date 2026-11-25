import { getCredentials } from '../src/config.ts';

const credential = getCredentials().find(item => item.kind === 'operator' && item.id === 'operator-local');
if (!credential) throw new Error('Opérateur local introuvable.');
console.log(credential.token);

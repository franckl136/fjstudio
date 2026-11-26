import { DomainError, type Credential, type Operator, type Role } from './contracts.ts';
import {controlVersion} from './control-room-adapters.ts';

export const profileVersion = 'studio-trusted-v1';
export const capabilityLabels = {
  'assignment.claim': 'Recevoir une attribution du Core',
  'context.readAssigned': 'Lire le contexte de la tentative',
  'artifact.prepare': 'Préparer le livrable synthétique',
  'artifact.verify': 'Évaluer le livrable avec le référentiel',
  'document.structure':'Indexer les titres du document',
  'document.coverage':'Localiser les critères dans le document',
  'evidence.verify':'Recalculer et comparer les preuves',
  'checkpoint.submit': 'Remettre sa preuve au Core',
  'documentation.read': 'Consulter librement les documents du projet',
  'knowledge.search': 'Rechercher dans la mémoire projet',
  'knowledge.propose': 'Proposer une connaissance',
  'knowledge.validate': 'Arbitrer une connaissance',
  'filesystem.write': 'Modifier un fichier projet',
  'test.execute': 'Lancer une commande de test',
  'app.preview': 'Exécuter une application',
  'git.observe': 'Observer le dépôt',
  'git.fetch': 'Contacter le dépôt distant',
  'git.branch': 'Créer une branche',
  'git.push': 'Écrire sur le dépôt distant',
  'git.merge': 'Fusionner une branche',
  'deployment.publish': 'Déployer',
  'mission.close': 'Clôturer une mission',
} as const;
export type Capability = keyof typeof capabilityLabels;

const profiles: Record<Role,{name:string;description:string;capabilities:readonly Capability[]}> = {
  preparer: {
    name: 'Préparateur', description: 'Structure les exigences synthétiques et cite le contexte figé.',
    capabilities: ['assignment.claim','context.readAssigned','artifact.prepare','checkpoint.submit'],
  },
  verifier: {
    name: 'Vérificateur', description: 'Compare le candidat à la source et remet le verdict indépendant.',
    capabilities: ['assignment.claim','context.readAssigned','artifact.verify','checkpoint.submit'],
  },
};

export function requireCapability(role: Role, capability: Capability) {
  if (!Object.hasOwn(profiles,role) || !profiles[role].capabilities.includes(capability)) {
    throw new DomainError(403,'agent_capability','Capacité interdite au rôle dans le profil de confiance.');
  }
}

export function missionContract() {
  return {
    version: profileVersion, runtime: 'deterministic-a1', costCeilingCents: 0,
    objective: 'Structurer les exigences synthétiques puis contrôler le livrable.',
    permissions: {preparer:profiles.preparer.capabilities, verifier:profiles.verifier.capabilities},
    resources: {concurrentAttemptsPerStep:1, projectFilesystem:false, providerNetwork:false},
    evidence: 'Checkpoint du préparateur et rapport du vérificateur, chacun avec SHA-256.',
    acceptance: 'Le Core accepte une remise concordante dans le bail et clôture sur le verdict du vérificateur.',
    stopConditions: ['annulation opérateur','horizon atteint','tentatives épuisées','verdict contrôlé'],
  };
}

export function visibleAgents(credentials: readonly Credential[], actor: Operator) {
  return credentials.flatMap(identity=>{
    if (identity.kind!=='runner' || !actor.projectIds.includes(identity.projectId)) return [];
    const profile=profiles[identity.role];
    const control=identity.engine==='control';
    const reading:Capability[]=identity.role==='preparer'?['document.structure']:['document.coverage','evidence.verify'];
    return [{
      id:identity.id, project:identity.projectId, role:identity.role, name:control&&identity.role==='preparer'?'Documentaliste':profile.name,
      description:control?'Relecture locale du contrat documentaire du projet.':profile.description,
      capabilities:control?reading:[...profile.capabilities],engine:control?'control':'a1',
      runtime:control?'deterministic-control':'deterministic-a1', version:control?controlVersion:profileVersion, costCeilingCents:0,
    }];
  });
}

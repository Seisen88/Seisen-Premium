import { fetchScripts } from '@/lib/scripts';
import ScriptsClient from '@/components/scripts/ScriptsClient';

export const revalidate = 60;

export default async function ScriptsPage() {
  const scripts = await fetchScripts();
  
  return <ScriptsClient initialScripts={scripts} />;
}

import type { RouteProps } from '../routes';
import { Hub } from './Hub';

/** The Learn tab (`#study`): the theory path, the teachers and the reference shelf. */
export default function StudyHub(_props: RouteProps) {
  return <Hub section="learn" title="Learn" subtitle="Theory in small bites, a teacher for your level, and a shelf of facts for when you need one." allTitle="Everything in Learn" />;
}

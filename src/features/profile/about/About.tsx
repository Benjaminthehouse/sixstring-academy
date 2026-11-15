import { openOnboarding } from '@/app/shell';
import { TEACHERS } from '@/app/teachers';
import { host } from '@/core/platform';
import { Badge, Banner, Button, Icon, List, ListItem, Section, cx } from '@/ui';
import pkg from '../../../../package.json';
import { BUILT_WITH, BUNDLED_DATA, CAPABILITIES, CREDITS, HONEST_LIMITS, LICENCE_NOTES, SUPPORT_TEXT, hostName, licenceCounts, type Support } from './model';
import styles from './About.module.css';

const SUPPORT_ICON: Readonly<Record<Support, string>> = { yes: 'Check', limited: 'CircleMinus', no: 'X' };
const SUPPORT_TONE: Readonly<Record<Support, 'ok' | 'warn' | 'neutral'>> = { yes: 'ok', limited: 'warn', no: 'neutral' };

function SupportCell({ label, support, note, here }: { label: string; support: Support; note: string; here: boolean }) {
  return (
    <div className={cx(styles.where, here && styles.whereHere)}>
      <p className={styles.whereLabel}>
        {label}
        {here && <span className={styles.hereTag}> · you are here</span>}
      </p>
      <p className={styles.whereState}>
        <Badge tone={SUPPORT_TONE[support]} icon={SUPPORT_ICON[support]}>
          {SUPPORT_TEXT[support]}
        </Badge>
      </p>
      <p className={styles.whereNote}>{note}</p>
    </div>
  );
}

/**
 * About: the version, what works in which host (the microphone and camera need the standalone
 * app), the honest limits of the camera and of sheet reading, and credits for the open-source
 * work the app is built on.
 */
export default function About() {
  const where = host();
  const licences = licenceCounts([...CREDITS, ...BUNDLED_DATA]);
  return (
    <div className={styles.screen}>
      <Section title="This app">
        <dl className={styles.facts}>
          <div>
            <dt>Version</dt>
            <dd data-about-version="">{pkg.version}</dd>
          </div>
          <div>
            <dt>Running</dt>
            <dd data-about-host={where}>{where === 'artifact' ? 'Inside Claude' : 'Standalone app'}</dd>
          </div>
          <div>
            <dt>Your data</dt>
            <dd>Stays in this browser</dd>
          </div>
        </dl>
        <p className={styles.prose}>
          Sixstring Academy is a guitar school without a server: lessons, songs, tools and your progress all live in this browser. Nothing you play or record leaves your device. The one exception is the optional AI helper, which sends what you ask it to
          Claude.
        </p>
        <p className={styles.prose}>
          {TEACHERS.map((t) => t.name).join(', ').replace(/, ([^,]*)$/, ' and $1')} are fictional teachers. Their lessons were written for this app, and the songs are traditional or in the public domain.
        </p>
        <div>
          <Button iconLeft="Sparkles" onClick={openOnboarding}>
            Show the welcome tour again
          </Button>
        </div>
      </Section>

      <Section title="What works where" description={`You are using the app ${hostName(where)}.`}>
        {where === 'artifact' ? (
          <Banner tone="info" title="The microphone and camera need the standalone app">
            Inside Claude the viewer keeps both switched off, and no setting here can change that. Everything else works, and wherever a screen would listen to your guitar you can tap the answer or play along with the reference sound instead. For the tuner and the
            live fretboard, open the app in its own browser tab.
          </Banner>
        ) : (
          <Banner tone="neutral" icon="Info" title="Shared inside Claude, a few things change">
            If this app is opened inside Claude, the viewer keeps the microphone and the camera switched off. Everything else works there, and Claude is built in for the AI helper.
          </Banner>
        )}
        <ul className={styles.matrix}>
          {CAPABILITIES.map((row) => (
            <li key={row.id} className={styles.row} data-capability={row.id}>
              <p className={styles.feature}>
                <Icon name={row.icon} size={18} />
                {row.feature}
              </p>
              <SupportCell label="Standalone app" support={row.standalone.support} note={row.standalone.note} here={where === 'standalone'} />
              <SupportCell label="Inside Claude" support={row.artifact.support} note={row.artifact.note} here={where === 'artifact'} />
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Honest limits" description="Two features are helpers, not judges.">
        <List variant="card">
          {HONEST_LIMITS.map((limit) => (
            <ListItem key={limit.id} icon={limit.icon} wrap title={limit.title} subtitle={limit.text} />
          ))}
        </List>
      </Section>

      <Section title="Credits and licences" description="Sixstring Academy is built on open-source work. Thank you to the people who made it.">
        <ul className={styles.credits}>
          {CREDITS.map((credit) => (
            <li key={credit.pkg} className={styles.credit} data-credit={credit.pkg}>
              <div className={styles.creditHead}>
                <a className={styles.creditName} href={credit.url} target="_blank" rel="noreferrer noopener">
                  {credit.name}
                  <Icon name="ExternalLink" size={14} label="opens in a new tab" />
                </a>
                <Badge>{credit.licence}</Badge>
              </div>
              <p className={styles.creditUse}>{credit.use}</p>
              <p className={styles.creditBy}>By {credit.by}</p>
            </li>
          ))}
          {BUNDLED_DATA.map((credit) => (
            <li key={credit.name} className={styles.credit}>
              <div className={styles.creditHead}>
                <a className={styles.creditName} href={credit.url} target="_blank" rel="noreferrer noopener">
                  {credit.name}
                  <Icon name="ExternalLink" size={14} label="opens in a new tab" />
                </a>
                <Badge>{credit.licence}</Badge>
              </div>
              <p className={styles.creditUse}>{credit.use}</p>
              <p className={styles.creditBy}>By {credit.by}</p>
            </li>
          ))}
        </ul>
        <details className={styles.licences}>
          <summary>What the licences mean</summary>
          <dl>
            {licences.map(([licence, count]) => (
              <div key={licence}>
                <dt>
                  {licence} <span className={styles.count}>({count})</span>
                </dt>
                <dd>{LICENCE_NOTES[licence] ?? 'See the project for its terms.'}</dd>
              </div>
            ))}
          </dl>
          <p>Built and tested with {BUILT_WITH.map((tool) => `${tool.name} (${tool.licence})`).join(', ')}. These tools do not ship inside the app. The full licence texts come with each project, linked above.</p>
        </details>
      </Section>
    </div>
  );
}

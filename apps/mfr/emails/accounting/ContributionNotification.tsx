import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export function ContributionNotification(props: {
  shareholderName: string
  /** Preformatted share count, e.g. "250". */
  shares: string
  date: string
  adminName: string
  inboxUrl: string
  inKind?: boolean
  description?: string | null
}) {
  const { shareholderName, shares, date, adminName, inboxUrl, inKind, description } = props
  return (
    <Html>
      <Head />
      <Preview>A purchase of {shares} shares was recorded for you</Preview>
      <Body style={{ fontFamily: 'sans-serif', backgroundColor: '#f6f6f6' }}>
        <Container
          style={{
            backgroundColor: '#ffffff',
            padding: '24px',
            borderRadius: '8px',
            maxWidth: '480px',
          }}
        >
          <Heading as="h2">Share purchase recorded</Heading>
          <Text>Hi {shareholderName},</Text>
          <Text>
            {adminName} recorded a purchase of <strong>{shares} shares</strong> for you on {date}.
            This has already been added to your share balance.
          </Text>
          {/* In-kind is exactly the case where the recipient needs to see what
              was contributed, so the description is shown rather than omitted. */}
          {inKind && (
            <Section>
              <Text style={{ margin: '4px 0' }}>
                <strong>In kind</strong> — goods or services rather than cash.
              </Text>
              {description && <Text style={{ margin: '4px 0' }}>{description}</Text>}
            </Section>
          )}
          <Section>
            <Link href={inboxUrl}>Review and acknowledge in your inbox</Link>
          </Section>
          <Text style={{ color: '#666', fontSize: '12px' }}>
            If this doesn&apos;t look right, just reply to this email.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default ContributionNotification

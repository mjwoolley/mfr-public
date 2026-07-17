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
  amount: string
  date: string
  adminName: string
  inboxUrl: string
}) {
  const { shareholderName, amount, date, adminName, inboxUrl } = props
  return (
    <Html>
      <Head />
      <Preview>A contribution of {amount} was recorded for you</Preview>
      <Body style={{ fontFamily: 'sans-serif', backgroundColor: '#f6f6f6' }}>
        <Container
          style={{
            backgroundColor: '#ffffff',
            padding: '24px',
            borderRadius: '8px',
            maxWidth: '480px',
          }}
        >
          <Heading as="h2">Contribution recorded</Heading>
          <Text>Hi {shareholderName},</Text>
          <Text>
            {adminName} recorded a contribution of <strong>{amount}</strong> for you on {date}. This
            has already been added to your share balance.
          </Text>
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

// react-email template: "reservation cancelled", showing the freed dates and
// who cancelled (owner or an admin on their behalf).

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

export function ReservationCancelled(props: {
  ownerName: string
  startDate: string
  endDate: string
  cancelledByName?: string
  calendarUrl: string
}) {
  const { ownerName, startDate, endDate, cancelledByName, calendarUrl } = props
  return (
    <Html>
      <Head />
      <Preview>Your reservation has been cancelled</Preview>
      <Body style={{ fontFamily: 'sans-serif', backgroundColor: '#f6f6f6' }}>
        <Container
          style={{
            backgroundColor: '#ffffff',
            padding: '24px',
            borderRadius: '8px',
            maxWidth: '480px',
          }}
        >
          <Heading as="h2">Reservation cancelled</Heading>
          <Text>Hi {ownerName},</Text>
          <Text>
            Your reservation from <strong>{startDate}</strong> to <strong>{endDate}</strong> has
            been cancelled.
          </Text>
          {cancelledByName ? <Text>Cancelled by {cancelledByName}.</Text> : null}
          <Text>The dates are now open for others to book.</Text>
          <Section>
            <Link href={calendarUrl}>View the calendar</Link>
          </Section>
          <Text style={{ color: '#666', fontSize: '12px' }}>
            Reservations admins are CC&apos;d on this notification. If something looks wrong, just
            reply to this email.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default ReservationCancelled

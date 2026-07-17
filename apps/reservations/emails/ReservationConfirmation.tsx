// react-email template: "booking confirmed", sent to the owner (cc admins)
// after a reservation is created. Rendered/sent by lib/notifications.ts.

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

export function ReservationConfirmation(props: {
  ownerName: string
  startDate: string
  endDate: string
  nights: number
  calendarUrl: string
}) {
  const { ownerName, startDate, endDate, nights, calendarUrl } = props
  return (
    <Html>
      <Head />
      <Preview>Your reservation is confirmed</Preview>
      <Body style={{ fontFamily: 'sans-serif', backgroundColor: '#f6f6f6' }}>
        <Container
          style={{
            backgroundColor: '#ffffff',
            padding: '24px',
            borderRadius: '8px',
            maxWidth: '480px',
          }}
        >
          <Heading as="h2">Reservation confirmed</Heading>
          <Text>Hi {ownerName},</Text>
          <Text>Your reservation is confirmed.</Text>
          <Section>
            <Text style={{ margin: '4px 0' }}>
              <strong>Check-in:</strong> {startDate}
            </Text>
            <Text style={{ margin: '4px 0' }}>
              <strong>Check-out:</strong> {endDate}
            </Text>
            <Text style={{ margin: '4px 0' }}>
              <strong>Nights:</strong> {nights}
            </Text>
          </Section>
          <Section>
            <Link href={calendarUrl}>View the calendar</Link>
          </Section>
          <Text style={{ color: '#666', fontSize: '12px' }}>
            Reservations admins are CC&apos;d on this confirmation. If something looks wrong, just
            reply to this email.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default ReservationConfirmation

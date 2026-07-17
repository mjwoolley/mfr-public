// react-email template: "dates changed", showing before → after and who made
// the change (owner or an admin on their behalf).

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

export function ReservationUpdated(props: {
  ownerName: string
  previousStartDate: string
  previousEndDate: string
  startDate: string
  endDate: string
  nights: number
  changedByName?: string
  calendarUrl: string
}) {
  const {
    ownerName,
    previousStartDate,
    previousEndDate,
    startDate,
    endDate,
    nights,
    changedByName,
    calendarUrl,
  } = props
  return (
    <Html>
      <Head />
      <Preview>Your reservation dates have changed</Preview>
      <Body style={{ fontFamily: 'sans-serif', backgroundColor: '#f6f6f6' }}>
        <Container
          style={{
            backgroundColor: '#ffffff',
            padding: '24px',
            borderRadius: '8px',
            maxWidth: '480px',
          }}
        >
          <Heading as="h2">Reservation updated</Heading>
          <Text>Hi {ownerName},</Text>
          <Text>Your reservation dates have changed.</Text>
          <Section>
            <Text style={{ margin: '4px 0', color: '#666' }}>
              <strong>Previous dates:</strong> {previousStartDate} – {previousEndDate}
            </Text>
            <Text style={{ margin: '4px 0' }}>
              <strong>New check-in:</strong> {startDate}
            </Text>
            <Text style={{ margin: '4px 0' }}>
              <strong>New check-out:</strong> {endDate}
            </Text>
            <Text style={{ margin: '4px 0' }}>
              <strong>Nights:</strong> {nights}
            </Text>
          </Section>
          {changedByName ? <Text>Changed by {changedByName}.</Text> : null}
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

export default ReservationUpdated

export function executionPacketFromVerification(verification) {
  const selectedContext = verification?.contextPacket?.selectedContext
  const constraints = verification?.constraints
  return {
    compiledMessage: String(verification?.compiledMessage || '').trim(),
    selectedContext: Array.isArray(selectedContext) ? selectedContext : [],
    constraints: Array.isArray(constraints)
      ? constraints.filter(Boolean).map(String)
      : String(constraints || '').split('\n').map((item) => item.trim()).filter(Boolean),
  }
}

export function assertExecutionPacket(packet) {
  if (!packet || typeof packet.compiledMessage !== 'string' || !packet.compiledMessage.trim() || !Array.isArray(packet.selectedContext) || !Array.isArray(packet.constraints)) {
    throw new Error('A compiled execution packet with explicit selected context and constraints is required.')
  }
  return packet
}

export type ProxyFailureCode =
  | 'encryption'
  | 'reality'
  | 'flow'
  | 'tls'
  | 'dns'
  | 'connection_refused'
  | 'network_unreachable'
  | 'connection_reset'
  | 'timeout'
  | 'authentication'
  | 'selector'
  | 'tun'

export interface ClassifiedProxyFailure {
  code: ProxyFailureCode
  userMessage: string
}

/** Privacy-safe classification of engine logs; never returns the raw line. */
export function classifyProxyFailure(line: string): ClassifiedProxyFailure | null {
  const lower = line.toLowerCase()

  if (lower.includes('nfspkeys') ||
      (lower.includes('encryption') && (lower.includes('vless') || lower.includes('nfs'))) ||
      lower.includes('vless encryption value')) {
    return {
      code: 'encryption',
      userMessage: 'Ошибка VLESS Encryption: ядро отклонило ключ или режим шифрования.',
    }
  }
  if (lower.includes('proxy not exist') || lower.includes('selector update error')) {
    return { code: 'selector', userMessage: 'Выбранный сервер отсутствует в текущей подписке.' }
  }
  if (lower.includes('nil ecdhekey') || lower.includes('mldsa') ||
      ((lower.includes('reality') || lower.includes('utls')) &&
        (lower.includes('handshake') || lower.includes('failed') || lower.includes('error')))) {
    return {
      code: 'reality',
      userMessage: 'Ошибка REALITY handshake: проверьте совместимость ядра, pbk, sid, SNI и fingerprint.',
    }
  }
  if (lower.includes('invalid flow') || (lower.includes('xtls') && lower.includes('error'))) {
    return { code: 'flow', userMessage: 'Неверный XTLS flow; сервер может требовать xtls-rprx-vision.' }
  }
  if (lower.includes('certificate') || (lower.includes('tls') && lower.includes('verify'))) {
    return { code: 'tls', userMessage: 'Не пройдена проверка TLS-сертификата или SNI.' }
  }
  if (lower.includes('authentication failed') || lower.includes('invalid user') ||
      lower.includes('bad tag') || lower.includes('aead')) {
    return { code: 'authentication', userMessage: 'Сервер отклонил учётные данные подключения.' }
  }
  if (lower.includes('no such host') || lower.includes('dns lookup') || lower.includes('server misbehaving')) {
    return { code: 'dns', userMessage: 'Не удалось определить адрес VPN-сервера через DNS.' }
  }
  if (lower.includes('connection refused')) {
    return { code: 'connection_refused', userMessage: 'Сервер отклонил TCP-подключение: порт закрыт или служба не запущена.' }
  }
  if (lower.includes('network is unreachable') || lower.includes('no route to host')) {
    return { code: 'network_unreachable', userMessage: 'Маршрут до VPN-сервера недоступен в текущей сети.' }
  }
  if (lower.includes('connection reset') || lower.includes('unexpected eof') || /\beof\b/.test(lower)) {
    return { code: 'connection_reset', userMessage: 'Соединение сброшено удалённой стороной во время handshake.' }
  }
  if (lower.includes('deadline exceeded') || lower.includes('timed out') || lower.includes('i/o timeout')) {
    return { code: 'timeout', userMessage: 'VPN-сервер не завершил подключение до истечения тайм-аута.' }
  }
  if ((lower.includes('tun') || lower.includes('wintun')) &&
      (lower.includes('access') || lower.includes('denied') || lower.includes('failed') || lower.includes('error'))) {
    return { code: 'tun', userMessage: 'Не удалось запустить системный VPN/TUN-интерфейс.' }
  }
  return null
}

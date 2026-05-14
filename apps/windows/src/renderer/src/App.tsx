export default function App(): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #6c63ff 0%, #4facfe 100%)',
        }}
      />
      <p style={{ color: '#f4f4f5', fontSize: 18, fontWeight: 600, letterSpacing: 1 }}>
        SLAVE VPN
      </p>
      <p style={{ color: '#a1a1aa', fontSize: 13 }}>Инициализация...</p>
    </div>
  )
}

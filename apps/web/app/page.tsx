export default function Home() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <h1
        style={{
          fontSize: "clamp(2rem, 6vw, 4rem)",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          margin: 0,
        }}
      >
        Dead Letter Diary
      </h1>
      <p
        style={{
          fontSize: "clamp(1rem, 2.5vw, 1.5rem)",
          color: "#888",
          marginTop: "1rem",
          fontStyle: "italic",
        }}
      >
        Write or it dies.
      </p>
    </div>
  );
}

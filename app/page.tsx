import { BaseGame } from "@/components/base-game"

export default function Home() {
  return (
    <main 
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{
        backgroundColor: '#5b616e'
      }}
    >
      <BaseGame />
    </main>
  )
}

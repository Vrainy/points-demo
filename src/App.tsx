import './App.css'
import { Canvas } from '@react-three/fiber'
import Scene from './canvas/Scene'

function App() {
  return (
    <>
      <Canvas style={{ width: '100vw', height: '100vh' }} camera={{
        position: [100, 100, 0],
        up: [0, 0, 1],
      }}
      >
        <Scene />
      </Canvas>

      <div
        style={{
          position: "absolute",
          top: 20,
          left: 100,
          color: "white",
          pointerEvents: "none",
        }}
      >
        按住 <b>Shift + 鼠标左键</b> 进行框选
      </div>
    </>
  )
}

export default App

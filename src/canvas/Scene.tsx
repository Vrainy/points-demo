import { Center, OrbitControls, Stats } from "@react-three/drei";
import Selector from "../controls/Selector";
import PointCloud from "./PointCloud";

export default function Scene() {
  return (
    <>
      <OrbitControls makeDefault />
      <Selector>
        <Center>
          <PointCloud />
        </Center>
      </Selector>

      <Stats />
    </>
  );
}

import Image from "next/image";
export function Brand(){
  return <div className="brand"><Image src="/logo.svg" width={174} height={48} alt="Ventora" priority /></div>
}

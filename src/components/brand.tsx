import Image from "next/image";

export function Brand() {
  return (
    <div className="brand">
      <Image src="/brand/cbb.png" width={697} height={869} alt="CBB Basquete Brasil" className="brand-mark" priority />
      <div><strong>Prontuário CBB</strong><small>Basquete Brasil</small></div>
    </div>
  );
}

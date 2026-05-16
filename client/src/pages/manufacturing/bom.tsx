import ManufacturingLayout from "@/components/manufacturing-layout";
import BomManagement from "@/pages/inventory/bom-management";

export default function MfgBomPage() {
  return <BomManagement Wrapper={ManufacturingLayout} basePath="/manufacturing/bom" />;
}

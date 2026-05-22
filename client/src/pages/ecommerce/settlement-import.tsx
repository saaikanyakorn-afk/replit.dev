import { useState, useRef, useMemo } from "react";
import EcommerceLayout from "@/components/ecommerce-layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountCombobox } from "@/components/account-combobox";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useCompany } from "@/lib/company-context";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import {
  Upload, FileSpreadsheet, ArrowLeft, ArrowRight, CheckCircle2, Calculator,
  Loader2, AlertTriangle, Columns, Eye, Settings2, Download, Calendar as CalendarIcon, Store, Wallet, Landmark,
} from "lucide-react";
import ThaiDateInput from "@/components/thai-date-input";
import { useDateSettings } from "@/hooks/use-date-settings";
import { toLocalDateStr } from "@/lib/utils";

interface WithdrawalRow {
  type: string;
  referenceId: string;
  requestTime: string;
  amount: number;
  status: string;
  successTime: string;
  bankAccount: string;
  selected: boolean;
}

type Platform = "shopee" | "lazada" | "tiktok" | "other";
type Step = "platform" | "upload" | "mapping" | "preview";

interface ColumnMapping {
  orderId: string;
  productAmount: string;
  shippingFee: string;
  sellerDiscount: string;
  platformDiscount: string;
  commissionFee: string;
  serviceFee: string;
  transactionFee: string;
  infraFee: string;
  shippingDeduction: string;
  platformShippingSubsidy: string;
  adjustments: string;
  buyerRefund: string;
  sellerShippingPromo: string;
  returnShipping: string;
  withholdingTax: string;
  adsDeduction: string;
  settlementAmount: string;
  settleDate: string;
  totalFees: string;
}

interface ParsedRow {
  orderId: string;
  productAmount: number;
  shippingFee: number;
  sellerDiscount: number;
  platformDiscount: number;
  commissionFee: number;
  serviceFee: number;
  transactionFee: number;
  infraFee: number;
  shippingDeduction: number;
  platformShippingSubsidy: number;
  adjustments: number;
  buyerRefund: number;
  sellerShippingPromo: number;
  returnShipping: number;
  withholdingTax: number;
  adsDeduction: number;
  settlementAmount: number;
  totalFees: number;
  settleDate: string;
}

const FIELD_LABELS: Record<keyof ColumnMapping, string> = {
  orderId: "เลขออเดอร์",
  productAmount: "ยอดสินค้า",
  shippingFee: "ค่าส่ง (ผู้ซื้อจ่าย)",
  sellerDiscount: "ส่วนลดผู้ขาย",
  platformDiscount: "ส่วนลดแพลตฟอร์ม",
  commissionFee: "ค่าคอมมิชชั่น",
  serviceFee: "ค่าบริการ",
  transactionFee: "ค่าธรรมเนียมธุรกรรม",
  infraFee: "ค่าโครงสร้างพื้นฐาน",
  shippingDeduction: "ค่าส่งที่หัก",
  platformShippingSubsidy: "ค่าส่งที่แพลตฟอร์มอุดหนุน",
  adjustments: "เงินปรับปรุง/ชดเชย",
  buyerRefund: "เงินคืนไปยังผู้ซื้อ",
  sellerShippingPromo: "โปรโมชั่นค่าส่งผู้ขาย",
  returnShipping: "ค่าจัดส่งสินค้าคืน",
  withholdingTax: "ภาษีหัก ณ ที่จ่าย",
  adsDeduction: "ค่าโฆษณาที่หัก",
  settlementAmount: "ยอดที่ได้รับ",
  totalFees: "ค่าธรรมเนียมรวม",
  settleDate: "วันที่ Settle",
};

const PLATFORM_FIELD_LABELS: Record<string, Partial<Record<keyof ColumnMapping, string>>> = {
  shopee: {
    orderId: "หมายเลขคำสั่งซื้อ",
    productAmount: "สินค้าราคาปกติ",
    shippingFee: "ค่าจัดส่งที่ชำระโดยผู้ซื้อ",
    sellerDiscount: "ส่วนลดสินค้าจากผู้ขาย",
    platformDiscount: "ส่วนลดสินค้าที่ออกโดย Shopee",
    commissionFee: "ค่าคอมมิชชั่น",
    serviceFee: "ค่าบริการ",
    transactionFee: "ค่าธุรกรรมการชำระเงิน",
    infraFee: "ค่าธรรมเนียมโครงสร้างพื้นฐาน",
    shippingDeduction: "ค่าจัดส่งที่ Shopee ชำระโดยชื่อของคุณ",
    platformShippingSubsidy: "ค่าจัดส่งสินค้าที่ออกโดย Shopee",
    adjustments: "ค่าชดเชยที่หายไป",
    buyerRefund: "จำนวนเงินที่ทำการคืนให้ผู้ซื้อ",
    sellerShippingPromo: "โปรโมชั่นค่าจัดส่งจากผู้ขาย",
    returnShipping: "ค่าจัดส่งสินค้าคืน",
    withholdingTax: "ภาษี",
    adsDeduction: "ค่าธรรมเนียมเติมเงินโฆษณาจากเงิน Escrow",
    settlementAmount: "จำนวนเงินทั้งหมดที่โอนแล้ว (฿)",
    settleDate: "วันที่โอนชำระเงินสำเร็จ",
  },
  lazada: {
    orderId: "Order Number",
    productAmount: "Item Price",
    shippingFee: "Shipping Fee",
    sellerDiscount: "Seller Discount",
    platformDiscount: "Lazada Voucher",
    commissionFee: "Commission",
    serviceFee: "Service Fee",
    transactionFee: "Payment Fee",
    shippingDeduction: "Shipping Fee Deduction",
    platformShippingSubsidy: "Shipping Subsidy",
    adjustments: "Adjustment",
    buyerRefund: "เงินคืนไปยังผู้ซื้อ",
    returnShipping: "Return Shipping",
    withholdingTax: "Withholding Tax",
    adsDeduction: "Ads Fee",
    settlementAmount: "Settlement Amount",
    settleDate: "วันที่โอนเงิน",
  },
  tiktok: {
    orderId: "Order/Adjustment ID",
    productAmount: "ยอดสินค้าหลังหักส่วนลดผู้ขาย",
    shippingFee: "ค่าจัดส่งที่ผู้ซื้อจ่าย",
    sellerDiscount: "ส่วนลดผู้ขาย",
    platformDiscount: "ส่วนลด TikTok (รวม Platform + Voucher)",
    commissionFee: "ค่าคอมมิชชั่น (รวม TikTok + Affiliate)",
    serviceFee: "ค่าบริการ (รวม SFP, Cashback, LIVE ฯลฯ)",
    transactionFee: "ค่าธรรมเนียมธุรกรรม",
    infraFee: "ค่าโครงสร้างพื้นฐาน (รวม Commerce growth)",
    shippingDeduction: "ค่าจัดส่งผู้ขาย",
    platformShippingSubsidy: "ส่วนลดค่าจัดส่งจาก TikTok",
    adjustments: "เงินปรับปรุง/ชดเชย",
    buyerRefund: "เงินคืนผู้ซื้อ (รวม Refund + ค่าส่ง)",
    returnShipping: "ค่าจัดส่งสินค้าคืน",
    withholdingTax: "ภาษีหัก ณ ที่จ่าย (PIT Affiliate)",
    adsDeduction: "ค่าโฆษณา",
    settlementAmount: "ยอดที่ได้รับรวม",
    settleDate: "วันที่ Settlement",
  },
};

function getFieldLabel(field: keyof ColumnMapping, platform: string): string {
  return PLATFORM_FIELD_LABELS[platform]?.[field] || FIELD_LABELS[field];
}

const PLATFORM_HEADERS: Record<string, Partial<Record<keyof ColumnMapping, string[]>>> = {
  shopee: {
    orderId: [
      "Order ID", "หมายเลขคำสั่งซื้อ", "เลขที่คำสั่งซื้อ", "order_sn", "Order No",
      "เลขที่ออเดอร์", "เลขคำสั่งซื้อ", "order_id", "เลขที่การสั่งซื้อ",
      "Order/Return ID", "หมายเลขรายการ",
    ],
    productAmount: [
      "Product Amount", "ราคาสินค้า", "ยอดสินค้า", "Original Price",
      "ราคาสินค้าที่ชำระโดยผู้ซื้อ", "ราคาสินค้าที่ชำระโดยผู้ซื้อ (THB)",
      "ยอดขายสินค้า", "Product Price", "Item Price", "ราคาต้นฉบับ",
      "ราคาดีลที่ตั้งไว้", "ราคาดีล", "ราคาขาย", "ยอดรวมสินค้า",
      "Product Subtotal", "ยอดสินค้ารวม",
      "สินค้าราคาปกติ",
    ],
    shippingFee: [
      "Shipping Fee (Paid by Buyer)", "ค่าส่ง (ผู้ซื้อจ่าย)", "Buyer Paid Shipping Fee",
      "ค่าจัดส่งที่ชำระโดยผู้ซื้อ", "ค่าจัดส่งที่ผู้ซื้อจ่าย",
      "ค่าจัดส่ง (ผู้ซื้อจ่าย)", "Shipping Fee Paid by Buyer",
      "Buyer shipping fee", "ค่าส่งที่ผู้ซื้อจ่าย", "ค่าจัดส่ง",
      "ค่าจัดส่งที่ชำระโดยผู้ซื้อ",
    ],
    sellerDiscount: [
      "Seller Discount", "ส่วนลดผู้ขาย", "Voucher from Seller",
      "ส่วนลดจากผู้ขาย", "ส่วนลดร้านค้า", "Seller Voucher",
      "โปรโมชั่นของผู้ขาย", "ส่วนลดจากร้านค้า", "Seller Promo",
      "ส่วนลดของผู้ขาย",
      "ส่วนลดสินค้าจากผู้ขาย", "โค้ดส่วนลดที่ออกโดยผู้ขาย",
      "โค้ดส่วนลดร่วมที่ออกโดยผู้ขาย",
      "Coins Cashback ที่สนับสนุนโดยผู้ขาย", "Coins Cashback ร่วมที่สนับสนุนโดยผู้ขาย",
    ],
    commissionFee: [
      "Commission Fee", "ค่าคอมมิชชั่น", "Commission",
      "ค่าคอมมิชชั่น (THB)", "ค่าธรรมเนียมคอมมิชชั่น",
      "ค่าคอมมิชชัน", "Commission Fee (THB)", "ค่านายหน้า",
      "ค่าคอมมิชชั่น AMS",
    ],
    serviceFee: [
      "Service Fee", "ค่าบริการ", "Service Fee (THB)",
      "ค่าบริการ (THB)", "ค่าธรรมเนียมบริการ", "Platform Fee",
      "ค่าธรรมเนียมแพลตฟอร์ม",
      "ค่าธรรมเนียม ของโปรแกรมประหยัดค่าจัดส่ง",
    ],
    infraFee: [
      "ค่าธรรมเนียมโครงสร้างพื้นฐานแพลตฟอร์ม",
      "Infrastructure Fee", "Platform Infrastructure Fee",
      "ค่าโครงสร้างพื้นฐาน", "ค่าธรรมเนียมโครงสร้างพื้นฐาน",
      "Infrastructure Fee (THB)",
    ],
    transactionFee: [
      "Transaction Fee", "ค่าธรรมเนียมธุรกรรม", "Transaction Fee (THB)",
      "ค่าธรรมเนียมการทำธุรกรรม", "ค่าธรรมเนียมการชำระเงิน",
      "Payment Fee", "ค่าธรรมเนียม", "ค่าธรรมเนียมธุรกรรม (THB)",
      "ค่าธรรมเนียมการทำธุรกรรม (THB)",
      "ค่าธุรกรรมการชำระเงิน",
    ],
    shippingDeduction: [
      "Shipping Fee Deduction", "ค่าส่งที่หัก", "Shipping Fee Discount",
      "ค่าจัดส่ง (ส่วนที่ Shopee หัก)", "ค่าจัดส่งโดยประมาณ",
      "ค่าจัดส่ง (ส่วนที่หัก)", "Shipping Rebate",
      "ค่าจัดส่งที่ร้านรับผิดชอบ", "ค่าส่งที่ต้องจ่าย",
      "ค่าจัดส่งที่ Shopee เรียกเก็บ", "Shipping Deduction",
      "ค่าจัดส่งที่ Shopee ชำระโดยชื่อของคุณ",
    ],
    platformDiscount: [
      "Shopee Voucher", "ส่วนลดจาก Shopee", "Voucher from Shopee",
      "ส่วนลดแพลตฟอร์ม", "Platform Discount", "Platform Voucher",
      "โค้ดส่วนลดที่ออกโดย Shopee", "ส่วนลด Shopee", "Shopee Discount",
      "โค้ดส่วนลดร่วมที่ออกโดย Shopee",
      "โค้ดส่วนลดที่ Shopee ออก", "ส่วนลดจากแพลตฟอร์ม",
      "Shopee Bundle Deal", "ส่วนลดจัดชุดสินค้า",
      "ส่วนลดแฟลชเซลที่ออกโดย Shopee", "Flash Sale Discount",
      "ส่วนลดสินค้าที่ออกโดย Shopee",
    ],
    platformShippingSubsidy: [
      "Shopee Shipping Rebate", "ค่าจัดส่งที่ชำระโดย Shopee",
      "ค่าส่งที่ Shopee ออก", "ค่าจัดส่งที่ Shopee อุดหนุน",
      "ค่าส่งอุดหนุนโดย Shopee", "Shipping Subsidy",
      "ค่าจัดส่งอุดหนุน", "Platform Shipping Subsidy",
      "ค่าจัดส่งที่อุดหนุนโดย Shopee", "ค่าจัดส่งที่ออกโดย Shopee",
      "ค่าส่งที่ออกโดย Shopee", "ค่าจัดส่งที่ Shopee ชำระ",
      "ค่าจัดส่งที่ Shopee สนับสนุน",
      "ค่าจัดส่งสินค้าที่ออกโดย Shopee",
      "Shopee coins", "Shopee Coins",
    ],
    adjustments: [
      "Adjustment", "เงินปรับปรุง", "เงินชดเชย", "Compensation",
      "ค่าปรับ", "Fine", "Penalty", "ค่าชดเชย",
      "เงินปรับ/ชดเชย", "การปรับปรุง", "Refund Adjustment",
      "Adjustments", "เงินคืนค่าคอมมิชชั่น", "Commission Rebate",
      "เงินชดเชยการจัดส่งล่าช้า", "Late Shipment Compensation",
      "ค่าชดเชยที่หายไป", "Lost Compensation", "ค่าชดเชยสินค้าหาย",
    ],
    buyerRefund: [
      "เงินคืนไปยังผู้ซื้อ", "Refund to Buyer", "Buyer Refund",
      "เงินคืนให้ผู้ซื้อ", "คืนเงินผู้ซื้อ", "Refund Amount",
      "จำนวนเงินคืน", "เงินคืน", "Customer Refund",
      "จำนวนเงินที่ทำการคืนให้ผู้ซื้อ", "เงินที่คืนไปยังผู้ซื้อ",
    ],
    sellerShippingPromo: [
      "โปรโมชั่นค่าจัดส่งจากผู้ขาย", "Seller Shipping Promotion",
      "โปรค่าส่งผู้ขาย", "Seller Free Shipping",
      "ส่วนลดค่าส่งจากผู้ขาย", "Seller Shipping Discount",
      "โปรโมชั่นค่าส่งร้านค้า", "โปรค่าจัดส่งผู้ขาย",
    ],
    returnShipping: [
      "ค่าจัดส่งสินค้าคืน", "Return Shipping", "Return Shipping Fee",
      "ค่าส่งคืนสินค้า", "ค่าจัดส่งคืน", "Reverse Shipping Fee",
      "ค่าขนส่งคืนสินค้า", "ค่าส่งกลับ",
      "ค่าจัดส่งสินค้าคืนผู้ขาย",
    ],
    withholdingTax: [
      "ภาษีหัก ณ ที่จ่าย", "Withholding Tax", "WHT", "ภาษี",
      "Tax", "ภ.ง.ด.", "หัก ณ ที่จ่าย", "ภาษีที่หัก",
      "Withholding Tax (THB)", "ภาษีหัก",
    ],
    adsDeduction: [
      "ค่าโฆษณา", "Ads Fee", "Advertising Fee", "AMS Fee",
      "ค่าโฆษณา Shopee Ads", "Shopee Ads", "ค่า AMS",
      "Advertising Deduction", "ค่าโฆษณาที่หัก", "Ads Deduction",
      "ค่าโปรโมท", "Promoted Listing Fee",
      "ค่าธรรมเนียมเติมเงินโฆษณาจากเงิน Escrow",
    ],
    settlementAmount: [
      "Settlement Amount", "ยอดที่ได้รับ", "Total Settlement Amount", "Payout",
      "จำนวนเงินที่ได้รับ", "ยอดรวมการชำระเงิน", "ยอดรับสุทธิ",
      "จำนวนเงินทั้งหมด", "จำนวนเงินที่โอนรวม", "ยอดเงินที่ได้รับ",
      "Total Released Amount", "Net Payout", "Total Payout",
      "ยอดสุทธิ", "ยอดโอน", "จำนวนเงินที่ได้รับ (THB)",
      "จำนวนเงินที่โอน", "ยอดชำระ",
      "จำนวนเงินทั้งหมดที่โอนแล้ว (฿)", "จำนวนเงินทั้งหมดที่โอนแล้ว",
    ],
    settleDate: [
      "วันที่โอนเงิน", "วันที่โอน", "Transfer Date", "Payout Date",
      "วันที่ชำระเงิน", "Settlement Date", "วันที่ Settlement",
      "วันที่โอนเงินสำเร็จ", "วันที่ทำรายการ", "Transaction Date",
      "วัน/เวลาที่โอนเงิน", "วันที่/เวลาที่โอนเงิน",
      "วันที่ตัดรอบ", "วันที่สรุปยอด", "วันที่โอนเงินให้ผู้ขาย",
      "วันที่โอนชำระเงินสำเร็จ",
    ],
  },
  lazada: {
    orderId: [
      "Order Number", "Order No", "OrderNumber", "หมายเลขคำสั่งซื้อ",
      "Order ID", "เลขที่คำสั่งซื้อ", "orderNumber", "เลขที่ออเดอร์",
      "Order Item No", "Order Item ID",
    ],
    productAmount: [
      "Item Price", "Unit Price", "ราคาสินค้า", "Item Revenue",
      "Paid Price", "ราคาขาย", "Product Price", "Seller Revenue",
      "ยอดขายสินค้า",
    ],
    shippingFee: [
      "Shipping Fee", "ค่าส่ง", "Shipping Fee (Paid By Customer)",
      "ค่าจัดส่ง", "ค่าจัดส่งที่ผู้ซื้อจ่าย", "Buyer Shipping Fee",
    ],
    sellerDiscount: [
      "Seller Discount", "ส่วนลด", "Voucher Seller",
      "ส่วนลดผู้ขาย", "ส่วนลดจากผู้ขาย", "Seller Voucher",
    ],
    commissionFee: [
      "Commission", "Commission Fee", "ค่าคอมมิชชั่น",
      "ค่าคอมมิชชัน", "Commission Amount",
    ],
    serviceFee: [
      "Service Fee", "ค่าบริการ", "Platform Fee",
      "ค่าธรรมเนียมบริการ",
    ],
    transactionFee: [
      "Payment Fee", "Transaction Fee", "ค่าธรรมเนียม",
      "ค่าธรรมเนียมธุรกรรม", "ค่าธรรมเนียมการชำระเงิน",
    ],
    platformDiscount: [
      "Lazada Voucher", "ส่วนลดจาก Lazada", "Platform Discount",
      "ส่วนลดแพลตฟอร์ม", "Voucher from Lazada", "Platform Voucher",
      "ส่วนลด Lazada", "Lazada Discount", "ส่วนลดจากแพลตฟอร์ม",
      "Lazada Bonus", "Flexi Combo Discount",
    ],
    shippingDeduction: [
      "Shipping Fee Deduction", "ค่าส่งหัก", "ค่าส่งที่หัก",
      "ค่าจัดส่งที่หัก", "Shipping Deduction",
    ],
    platformShippingSubsidy: [
      "Shipping Subsidy", "ค่าจัดส่งอุดหนุน", "Platform Shipping Subsidy",
      "ค่าจัดส่งที่ Lazada ออก", "Lazada Shipping Subsidy",
    ],
    adjustments: [
      "Adjustment", "เงินปรับปรุง", "เงินชดเชย", "Compensation",
      "Adjustments", "ค่าปรับ", "อื่นๆ", "Others", "Other Fees",
      "Refund Adjustment", "การปรับปรุง",
    ],
    buyerRefund: [
      "เงินคืนไปยังผู้ซื้อ", "Refund to Buyer", "Buyer Refund",
      "เงินคืนให้ผู้ซื้อ", "คืนเงินผู้ซื้อ", "Refund Amount",
    ],
    sellerShippingPromo: [
      "โปรโมชั่นค่าจัดส่งจากผู้ขาย", "Seller Shipping Promotion",
      "ส่วนลดค่าส่งจากผู้ขาย", "Seller Free Shipping",
    ],
    returnShipping: [
      "ค่าจัดส่งสินค้าคืน", "Return Shipping", "Return Shipping Fee",
      "ค่าส่งคืนสินค้า", "Reverse Shipping Fee",
    ],
    withholdingTax: [
      "ภาษีหัก ณ ที่จ่าย", "Withholding Tax", "WHT", "ภาษี", "Tax",
    ],
    adsDeduction: [
      "ค่าโฆษณา", "Ads Fee", "Advertising Fee", "Lazada Ads",
      "ค่าโฆษณาที่หัก", "Advertising Deduction",
    ],
    settlementAmount: [
      "Payout Amount", "Payout", "ยอดที่ได้รับ", "Settlement Amount",
      "Net Payout", "ยอดสุทธิ", "ยอดรับสุทธิ", "จำนวนเงินที่ได้รับ",
      "Total Payout",
    ],
    settleDate: [
      "Payout Date", "Transfer Date", "Settlement Date", "วันที่โอนเงิน",
      "วันที่ Settlement", "วันที่ชำระเงิน", "วันที่โอน",
    ],
  },
  tiktok: {
    orderId: [
      "Order/adjustment ID", "Order/Adjustment ID",
      "Order ID", "Order No.", "หมายเลขคำสั่งซื้อ", "order_id",
      "เลขที่คำสั่งซื้อ", "เลขที่ออเดอร์",
    ],
    productAmount: [
      "Subtotal before discounts",
      "Total Revenue",
      "Subtotal after seller discounts",
      "Product Revenue", "Revenue", "ยอดสินค้า", "Total product price",
      "ราคาสินค้า", "ยอดขายสินค้า",
    ],
    shippingFee: [
      "Customer shipping fee", "Customer Shipping Fee",
      "Shipping Fee", "ค่าส่ง", "Buyer shipping fee",
      "ค่าจัดส่ง", "ค่าจัดส่งที่ผู้ซื้อจ่าย",
    ],
    sellerDiscount: [
      "Seller discounts", "Seller Discount",
      "ส่วนลดผู้ขาย", "ส่วนลดจากผู้ขาย",
    ],
    commissionFee: [
      "TikTok Shop commission fee", "TikTok Shop Commission Fee",
      "Platform Commission", "Commission", "ค่าคอมมิชชั่น",
      "Commission Fee",
    ],
    serviceFee: [
      "SFP service fee",
      "Service Fee", "ค่าบริการ",
    ],
    transactionFee: [
      "Transaction fee", "Transaction Fee",
      "ค่าธรรมเนียมธุรกรรม", "Payment Fee",
    ],
    infraFee: [
      "Infrastructure fee", "Infrastructure Fee",
      "ค่าโครงสร้างพื้นฐาน",
    ],
    platformDiscount: [
      "Platform discounts", "Platform Discount",
      "TikTok Voucher", "ส่วนลดจาก TikTok",
      "ส่วนลดแพลตฟอร์ม",
    ],
    shippingDeduction: [
      "Actual shipping fee", "Actual Shipping Fee",
      "Seller shipping fee", "Seller Shipping Fee",
      "Shipping Fee Deduction",
    ],
    platformShippingSubsidy: [
      "Platform shipping fee discount", "Platform Shipping Fee Discount",
      "Shipping subsidy", "Shipping Subsidy",
    ],
    adjustments: [
      "Ajustment amount", "Adjustment amount",
      "Adjustment", "เงินปรับปรุง", "Adjustments",
    ],
    buyerRefund: [
      "Refund subtotal after seller discounts",
      "Customer refund", "เงินคืนไปยังผู้ซื้อ",
      "Refund to Buyer", "Buyer Refund",
    ],
    sellerShippingPromo: [
      "Seller shipping fee discount",
      "โปรโมชั่นค่าจัดส่งจากผู้ขาย",
    ],
    returnShipping: [
      "Actual return shipping fee", "Actual Return Shipping Fee",
      "ค่าจัดส่งสินค้าคืน", "Return Shipping Fee",
    ],
    withholdingTax: [
      "Personal income tax withheld from affiliate commission",
      "Withholding Tax", "WHT", "ภาษีหัก ณ ที่จ่าย",
    ],
    adsDeduction: [
      "ค่าโฆษณา", "Ads Fee", "Advertising Fee",
    ],
    settlementAmount: [
      "Total settlement amount", "Total Settlement Amount",
      "Settlement Amount", "ยอดรับสุทธิ", "ยอดที่ได้รับ",
    ],
    totalFees: [
      "Total Fees", "Total fees",
      "ค่าธรรมเนียมรวม",
    ],
    settleDate: [
      "Order settled time", "Order Settled Time",
      "Settlement Date", "วันที่โอนเงิน",
    ],
  },
};

const PLATFORM_EXTRA_SUM_COLUMNS: Record<string, Partial<Record<keyof ColumnMapping, string[]>>> = {
  tiktok: {
    commissionFee: [
      "Affiliate Commission", "Affiliate partner commission",
      "Affiliate Shop Ads commission", "Affiliate Partner shop ads commission",
      "Affiliate commission deposit", "Affiliate commission refund",
    ],
    serviceFee: [
      "Bonus cashback service fee", "LIVE Specials service fee",
      "Voucher Xtra service fee", "EAMS Program service fee",
      "Brands Crazy Deals/Flash Sale service fee", "TikTok PayLater program fee",
      "Pre-order service fee",
    ],
    infraFee: [
      "Commerce growth fee", "Campaign resource fee",
      "Credit card installment - Interest rate cost",
    ],
    platformDiscount: [
      "Platform co-funded voucher discounts", "GMV Max Coupon",
      "Seller co-funded voucher discount",
    ],
    buyerRefund: [
      "Refunded customer shipping fee",
    ],
    withholdingTax: [
      "Personal income tax withheld from affiliate Shop Ads commission",
    ],
    platformShippingSubsidy: [],
  },
};

const PLATFORMS_LIST = [
  { value: "shopee" as Platform, label: "Shopee", color: "#EE4D2D", bg: "bg-orange-50 border-orange-200 hover:border-orange-400" },
  { value: "lazada" as Platform, label: "Lazada", color: "#0F146D", bg: "bg-indigo-50 border-indigo-200 hover:border-indigo-400" },
  { value: "tiktok" as Platform, label: "TikTok Shop", color: "#000000", bg: "bg-gray-50 border-gray-300 hover:border-gray-500" },
  { value: "other" as Platform, label: "อื่นๆ", color: "#6B7280", bg: "bg-gray-50 border-gray-200 hover:border-gray-400" },
];

function fmt(v: number | string | null | undefined): string {
  return Number(v || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const EMPTY_MAPPING: ColumnMapping = {
  orderId: "", productAmount: "", shippingFee: "", sellerDiscount: "", platformDiscount: "",
  commissionFee: "", serviceFee: "", transactionFee: "", infraFee: "", shippingDeduction: "",
  platformShippingSubsidy: "", adjustments: "", buyerRefund: "", sellerShippingPromo: "",
  returnShipping: "", withholdingTax: "", adsDeduction: "", settlementAmount: "", totalFees: "", settleDate: "",
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim()
    .replace(/\s*\(thb\)\s*/gi, "")
    .replace(/\s*\(บาท\)\s*/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\*/g, "");
}

function autoDetectMapping(headers: string[], platform: Platform): ColumnMapping {
  const mapping = { ...EMPTY_MAPPING };
  const normalizedHeaders = headers.map(normalizeHeader);
  const usedIndices = new Set<number>();

  const tryMatch = (platformMap: Partial<Record<keyof ColumnMapping, string[]>> | undefined) => {
    if (!platformMap) return;
    for (const [field, patterns] of Object.entries(platformMap)) {
      if (!patterns || (mapping as any)[field]) continue;
      for (const pattern of patterns) {
        const np = normalizeHeader(pattern);
        const idx = normalizedHeaders.findIndex((h, i) => !usedIndices.has(i) && h === np);
        if (idx >= 0) {
          (mapping as any)[field] = headers[idx];
          usedIndices.add(idx);
          break;
        }
      }
      if (!(mapping as any)[field]) {
        for (const pattern of patterns) {
          const np = normalizeHeader(pattern);
          const idx = normalizedHeaders.findIndex((h, i) => !usedIndices.has(i) && h.includes(np));
          if (idx >= 0) {
            (mapping as any)[field] = headers[idx];
            usedIndices.add(idx);
            break;
          }
        }
      }
    }
  };

  tryMatch(PLATFORM_HEADERS[platform]);

  if (platform === "other") {
    for (const p of Object.keys(PLATFORM_HEADERS)) {
      tryMatch(PLATFORM_HEADERS[p]);
    }
  }

  return mapping;
}

export default function SettlementImport() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { dateEra, dateFmt } = useDateSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("platform");
  const [platform, setPlatform] = useState<Platform | "">("");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({ ...EMPTY_MAPPING });
  const [debugInfo, setDebugInfo] = useState("");
  const [settlementDate, setSettlementDate] = useState(toLocalDateStr(new Date()));
  const [settlementNo, setSettlementNo] = useState("");
  const [autoJournal, setAutoJournal] = useState(true);
  const [withdrawalRows, setWithdrawalRows] = useState<WithdrawalRow[]>([]);
  const [bankAccountCode, setBankAccountCode] = useState("");
  const [withdrawalResult, setWithdrawalResult] = useState<{ message: string; totalAmount: number; imported: any[]; skipped: any[] } | null>(null);
  const [reportSummary, setReportSummary] = useState<{
    timePeriod: string;
    totalSettlement: number;
    totalRevenue: number;
    totalFees: number;
    totalAdjustments: number;
    feeBreakdown: { label: string; amount: number }[];
    walletEarnings: number;
    walletWithdrawals: number;
    walletBalance: number;
  } | null>(null);

  const { data: accountsList = [] } = useQuery<any[]>({
    queryKey: ["/api/accounts", selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) return [];
      const res = await fetch(`/api/accounts?companyId=${selectedCompanyId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedCompanyId,
  });

  const bankAccounts = accountsList.filter((a: any) => a.code?.startsWith("101") || a.code?.startsWith("102"));

  const [validation, setValidation] = useState<{
    total: number; matched: number; notFound: number; notFoundIds: string[];
    crossPeriod: { month: string; count: number; totalAmount: number }[];
    alreadySettled: number; alreadySettledIds: string[];
    duplicateInFile: number; duplicateIds?: string[];
  } | null>(null);
  const [validating, setValidating] = useState(false);

  function parseExcelDate(val: any): string {
    if (!val) return "";
    if (typeof val === "number") {
      const d = XLSX.SSF.parse_date_code(val);
      if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
    const s = String(val).trim();
    const ymd = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
    if (ymd) {
      const y = Number(ymd[1]) > 2500 ? Number(ymd[1]) - 543 : Number(ymd[1]);
      return `${y}-${String(ymd[2]).padStart(2, "0")}-${String(ymd[3]).padStart(2, "0")}`;
    }
    const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
    if (dmy) {
      const y = Number(dmy[3]) > 2500 ? Number(dmy[3]) - 543 : (Number(dmy[3]) < 100 ? 2000 + Number(dmy[3]) : Number(dmy[3]));
      return `${y}-${String(dmy[2]).padStart(2, "0")}-${String(dmy[1]).padStart(2, "0")}`;
    }
    return "";
  }

  const parsedRows = useMemo<ParsedRow[]>(() => {
    if (!mapping.orderId && !mapping.settlementAmount) return [];
    const extraCols = PLATFORM_EXTRA_SUM_COLUMNS[platform] || {};
    const headerList = headers;

    const findExtraHeaders = (colNames: string[]): string[] => {
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
      return colNames.map(cn => {
        const ncn = norm(cn);
        return headerList.find(h => norm(h) === ncn) || "";
      }).filter(Boolean);
    };

    const extraHeadersMap: Partial<Record<keyof ColumnMapping, string[]>> = {};
    for (const [field, colNames] of Object.entries(extraCols)) {
      extraHeadersMap[field as keyof ColumnMapping] = findExtraHeaders(colNames);
    }

    const getNum = (row: Record<string, any>, col: string) => Number(row[col]) || 0;
    const getExtraSum = (row: Record<string, any>, field: keyof ColumnMapping) => {
      const extra = extraHeadersMap[field];
      if (!extra || extra.length === 0) return 0;
      return extra.reduce((sum, h) => sum + getNum(row, h), 0);
    };

    return rawData.map(row => ({
      orderId: String(row[mapping.orderId] || ""),
      productAmount: getNum(row, mapping.productAmount) + getExtraSum(row, "productAmount"),
      shippingFee: getNum(row, mapping.shippingFee) + getExtraSum(row, "shippingFee"),
      sellerDiscount: getNum(row, mapping.sellerDiscount) + getExtraSum(row, "sellerDiscount"),
      platformDiscount: getNum(row, mapping.platformDiscount) + getExtraSum(row, "platformDiscount"),
      commissionFee: getNum(row, mapping.commissionFee) + getExtraSum(row, "commissionFee"),
      serviceFee: getNum(row, mapping.serviceFee) + getExtraSum(row, "serviceFee"),
      transactionFee: getNum(row, mapping.transactionFee) + getExtraSum(row, "transactionFee"),
      infraFee: getNum(row, mapping.infraFee) + getExtraSum(row, "infraFee"),
      shippingDeduction: getNum(row, mapping.shippingDeduction) + getExtraSum(row, "shippingDeduction"),
      platformShippingSubsidy: getNum(row, mapping.platformShippingSubsidy) + getExtraSum(row, "platformShippingSubsidy"),
      adjustments: getNum(row, mapping.adjustments) + getExtraSum(row, "adjustments"),
      buyerRefund: getNum(row, mapping.buyerRefund) + getExtraSum(row, "buyerRefund"),
      sellerShippingPromo: getNum(row, mapping.sellerShippingPromo) + getExtraSum(row, "sellerShippingPromo"),
      returnShipping: getNum(row, mapping.returnShipping) + getExtraSum(row, "returnShipping"),
      withholdingTax: getNum(row, mapping.withholdingTax) + getExtraSum(row, "withholdingTax"),
      adsDeduction: getNum(row, mapping.adsDeduction) + getExtraSum(row, "adsDeduction"),
      settlementAmount: getNum(row, mapping.settlementAmount) + getExtraSum(row, "settlementAmount"),
      totalFees: getNum(row, mapping.totalFees),
      settleDate: mapping.settleDate ? parseExcelDate(row[mapping.settleDate]) : "",
    })).filter(r => r.orderId || r.settlementAmount);
  }, [rawData, mapping, platform, headers]);

  const totals = useMemo(() => {
    return parsedRows.reduce(
      (acc, r) => ({
        productAmount: acc.productAmount + r.productAmount,
        shippingFee: acc.shippingFee + r.shippingFee,
        sellerDiscount: acc.sellerDiscount + r.sellerDiscount,
        platformDiscount: acc.platformDiscount + r.platformDiscount,
        commissionFee: acc.commissionFee + r.commissionFee,
        serviceFee: acc.serviceFee + r.serviceFee,
        transactionFee: acc.transactionFee + r.transactionFee,
        infraFee: acc.infraFee + r.infraFee,
        shippingDeduction: acc.shippingDeduction + r.shippingDeduction,
        platformShippingSubsidy: acc.platformShippingSubsidy + r.platformShippingSubsidy,
        adjustments: acc.adjustments + r.adjustments,
        buyerRefund: acc.buyerRefund + r.buyerRefund,
        sellerShippingPromo: acc.sellerShippingPromo + r.sellerShippingPromo,
        returnShipping: acc.returnShipping + r.returnShipping,
        withholdingTax: acc.withholdingTax + r.withholdingTax,
        adsDeduction: acc.adsDeduction + r.adsDeduction,
        settlementAmount: acc.settlementAmount + r.settlementAmount,
        totalFees: acc.totalFees + r.totalFees,
      }),
      { productAmount: 0, shippingFee: 0, sellerDiscount: 0, platformDiscount: 0, commissionFee: 0, serviceFee: 0, transactionFee: 0, infraFee: 0, shippingDeduction: 0, platformShippingSubsidy: 0, adjustments: 0, buyerRefund: 0, sellerShippingPromo: 0, returnShipping: 0, withholdingTax: 0, adsDeduction: 0, settlementAmount: 0, totalFees: 0 }
    );
  }, [parsedRows]);

  const reconciliation = useMemo(() => {
    const credits = [
      { label: "ยอดสินค้า", amount: totals.productAmount, mapped: !!mapping.productAmount },
      { label: "ค่าส่ง (ผู้ซื้อจ่าย)", amount: totals.shippingFee, mapped: !!mapping.shippingFee },
      { label: "ค่าส่งอุดหนุนจากแพลตฟอร์ม", amount: totals.platformShippingSubsidy, mapped: !!mapping.platformShippingSubsidy },
      { label: "เงินปรับปรุง/ชดเชย", amount: totals.adjustments, mapped: !!mapping.adjustments },
    ];

    const mappedFeeItems = [
      { label: "ส่วนลดผู้ขาย", amount: totals.sellerDiscount, mapped: !!mapping.sellerDiscount },
      { label: "ส่วนลดแพลตฟอร์ม", amount: totals.platformDiscount, mapped: !!mapping.platformDiscount },
      { label: "ค่าคอมมิชชั่น", amount: totals.commissionFee, mapped: !!mapping.commissionFee },
      { label: "ค่าบริการ", amount: totals.serviceFee, mapped: !!mapping.serviceFee },
      { label: "ค่าธรรมเนียมธุรกรรม", amount: totals.transactionFee, mapped: !!mapping.transactionFee },
      { label: "ค่าโครงสร้างพื้นฐาน", amount: totals.infraFee, mapped: !!mapping.infraFee },
      { label: "ค่าส่งที่หัก", amount: totals.shippingDeduction, mapped: !!mapping.shippingDeduction },
      { label: "เงินคืนผู้ซื้อ", amount: totals.buyerRefund, mapped: !!mapping.buyerRefund },
      { label: "โปรค่าส่งผู้ขาย", amount: totals.sellerShippingPromo, mapped: !!mapping.sellerShippingPromo },
      { label: "ค่าจัดส่งคืน", amount: totals.returnShipping, mapped: !!mapping.returnShipping },
      { label: "ภาษีหัก ณ ที่จ่าย", amount: totals.withholdingTax, mapped: !!mapping.withholdingTax },
      { label: "ค่าโฆษณา", amount: totals.adsDeduction, mapped: !!mapping.adsDeduction },
    ];

    const mappedFeeTotal = mappedFeeItems.reduce((s, d) => s + d.amount, 0);
    let unmappedFees = 0;
    if (mapping.totalFees && totals.totalFees !== 0) {
      const feeFieldsInTotalFees = totals.commissionFee + totals.serviceFee + totals.transactionFee
        + totals.infraFee + totals.shippingDeduction + totals.platformShippingSubsidy;
      unmappedFees = Math.round((totals.totalFees - feeFieldsInTotalFees) * 100) / 100;
    }

    const debits = [
      ...mappedFeeItems,
      ...(unmappedFees !== 0 ? [{ label: "ค่าธรรมเนียมอื่น (จาก Total Fees)", amount: unmappedFees, mapped: true }] : []),
    ];

    const totalCredits = credits.reduce((s, c) => s + c.amount, 0);
    const totalDebits = debits.reduce((s, d) => s + d.amount, 0);
    const calculatedNet = totalCredits + totalDebits;
    const fileNet = totals.settlementAmount;
    const variance = Math.round((calculatedNet - fileNet) * 100) / 100;

    const mappedHeaders = new Set<string>();
    for (const val of Object.values(mapping)) {
      if (val) mappedHeaders.add(val);
    }
    const extraCols = PLATFORM_EXTRA_SUM_COLUMNS[platform] || {};
    for (const colNames of Object.values(extraCols)) {
      if (colNames) {
        for (const cn of colNames) {
          const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
          const found = headers.find(h => norm(h) === norm(cn));
          if (found) mappedHeaders.add(found);
        }
      }
    }

    const unmappedColumns: { header: string; total: number }[] = [];
    for (const h of headers) {
      if (mappedHeaders.has(h)) continue;
      const normH = h.toLowerCase().trim();
      if (!normH || normH === "order id" || normH === "no" || normH === "order number" || normH === "#") continue;
      let sum = 0;
      let hasNumber = false;
      for (const row of rawData) {
        const v = Number(row[h]);
        if (!isNaN(v) && v !== 0) {
          sum += v;
          hasNumber = true;
        }
      }
      if (hasNumber && Math.abs(sum) >= 0.01) {
        unmappedColumns.push({ header: h, total: Math.round(sum * 100) / 100 });
      }
    }
    unmappedColumns.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

    return { credits, debits, totalCredits, totalDebits, calculatedNet, fileNet, variance, unmappedColumns };
  }, [totals, mapping, headers, rawData, platform]);

  const dailySummary = useMemo(() => {
    const groups: Record<string, { orders: string[]; total: number; count: number }> = {};
    for (const row of parsedRows) {
      const key = row.settleDate || "(ไม่ระบุวันที่)";
      if (!groups[key]) groups[key] = { orders: [], total: 0, count: 0 };
      groups[key].orders.push(row.orderId);
      groups[key].total += row.settlementAmount;
      groups[key].count += 1;
    }
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));
  }, [parsedRows]);

  const hasSettleDates = useMemo(() => parsedRows.some(r => r.settleDate), [parsedRows]);

  const mappedCount = Object.values(mapping).filter(v => v).length;

  async function runValidation(rows: ParsedRow[]) {
    if (!selectedCompanyId || !platform || rows.length === 0) return;
    setValidating(true);
    try {
      const orderIds = rows.map(r => r.orderId).filter(Boolean);
      const r = await fetch("/api/ecommerce/settlement-batches/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          companyId: selectedCompanyId,
          platform,
          settlementDate,
          orderIds,
        }),
      });
      if (r.ok) {
        setValidation(await r.json());
      }
    } catch {}
    setValidating(false);
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const rawBuffer = ev.target?.result as ArrayBuffer;
        let data = new Uint8Array(rawBuffer);

        function decodeCol(colStr: string): number {
          let ci = 0;
          for (let i = 0; i < colStr.length; i++) ci = ci * 26 + (colStr.charCodeAt(i) - 65);
          return ci;
        }
        function decodeXmlEntities(s: string): string {
          return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
        }

        let xlsxFallbackSheets: Record<string, any[][]> | null = null;
        let xlsxFallbackNames: string[] = [];
        try {
          const zip = await JSZip.loadAsync(rawBuffer);

          const ssStrings: string[] = [];
          const ssFile = zip.file("xl/sharedStrings.xml");
          if (ssFile) {
            const ssXml = await ssFile.async("string");
            const siRe = /<si[^>]*>([\s\S]*?)<\/si>/g;
            let siM;
            while ((siM = siRe.exec(ssXml)) !== null) {
              const tRe = /<t[^>]*?>([\s\S]*?)<\/t>/g;
              let txt = "";
              let tM;
              while ((tM = tRe.exec(siM[1])) !== null) txt += tM[1];
              ssStrings.push(decodeXmlEntities(txt));
            }
          }

          const wbFile = zip.file("xl/workbook.xml");
          const relsFile = zip.file("xl/_rels/workbook.xml.rels");
          const sheetNameMap: Record<string, string> = {};
          if (wbFile && relsFile) {
            const wbXml = await wbFile.async("string");
            const relsXml = await relsFile.async("string");
            const sheetRe = /<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"/g;
            let sM;
            const idToName: Record<string, string> = {};
            while ((sM = sheetRe.exec(wbXml)) !== null) idToName[sM[2]] = decodeXmlEntities(sM[1]);
            const relRe = /<Relationship\b[^>]*Id="([^"]*)"[^>]*Target="([^"]*)"/g;
            let rM;
            while ((rM = relRe.exec(relsXml)) !== null) {
              const target = rM[2].startsWith("/") ? rM[2].substring(1) : `xl/${rM[2]}`;
              if (idToName[rM[1]]) sheetNameMap[target] = idToName[rM[1]];
            }
          }

          const sheetFiles = Object.keys(zip.files)
            .filter(f => /^xl\/worksheets\/sheet\d+\.xml$/i.test(f))
            .sort();

          const parsedSheets: Record<string, any[][]> = {};
          const parsedNames: string[] = [];

          for (const sf of sheetFiles) {
            const xml = await zip.file(sf)!.async("string");
            const rows: any[][] = [];
            let pos = 0;
            while (true) {
              const rStart = xml.indexOf("<row", pos);
              if (rStart === -1) break;
              const rTagEnd = xml.indexOf(">", rStart);
              if (rTagEnd === -1) break;
              const selfClose = xml[rTagEnd - 1] === "/";
              let rEnd: number;
              let rowContent: string;
              if (selfClose) {
                rEnd = rTagEnd + 1;
                rowContent = "";
              } else {
                rEnd = xml.indexOf("</row>", rTagEnd);
                if (rEnd === -1) break;
                rowContent = xml.substring(rTagEnd + 1, rEnd);
                rEnd += 6;
              }
              const rowTag = xml.substring(rStart, rTagEnd + 1);
              const rNumM = rowTag.match(/\br="(\d+)"/);
              const rowIdx = rNumM ? parseInt(rNumM[1]) - 1 : rows.length;
              while (rows.length <= rowIdx) rows.push([]);

              let cPos = 0;
              while (true) {
                const cStart = rowContent.indexOf("<c", cPos);
                if (cStart === -1) break;
                const cTagEnd = rowContent.indexOf(">", cStart);
                if (cTagEnd === -1) break;
                const cSelfClose = rowContent[cTagEnd - 1] === "/";
                let cEnd: number;
                let cellContent: string;
                if (cSelfClose) {
                  cEnd = cTagEnd + 1;
                  cellContent = "";
                } else {
                  cEnd = rowContent.indexOf("</c>", cTagEnd);
                  if (cEnd === -1) break;
                  cellContent = rowContent.substring(cTagEnd + 1, cEnd);
                  cEnd += 4;
                }
                const cTag = rowContent.substring(cStart, cTagEnd + 1);
                const refM = cTag.match(/\br="([A-Z]{1,3})(\d+)"/);
                if (refM) {
                  const colIdx = decodeCol(refM[1]);
                  const typeM = cTag.match(/\bt="(\w+)"/);
                  const cType = typeM ? typeM[1] : "";
                  const vM = cellContent.match(/<v>([\s\S]*?)<\/v>/);
                  const rawVal = vM ? vM[1] : "";
                  let val: any = "";
                  if (cType === "s") {
                    val = ssStrings[parseInt(rawVal)] ?? "";
                  } else if (cType === "inlineStr") {
                    const isM = cellContent.match(/<is[^>]*>[\s\S]*?<t[^>]*?>([\s\S]*?)<\/t>/);
                    val = isM ? decodeXmlEntities(isM[1]) : "";
                  } else if (cType === "b") {
                    val = rawVal === "1";
                  } else if (rawVal) {
                    const num = Number(rawVal);
                    val = isNaN(num) ? rawVal : num;
                  }
                  while (rows[rowIdx].length <= colIdx) rows[rowIdx].push("");
                  rows[rowIdx][colIdx] = val;
                }
                cPos = cEnd;
              }
              pos = rEnd;
            }

            const sheetName = sheetNameMap[sf] || sf.replace(/^xl\/worksheets\//, "").replace(/\.xml$/i, "");
            parsedSheets[sheetName] = rows;
            parsedNames.push(sheetName);
          }

          if (parsedNames.length > 0) {
            xlsxFallbackSheets = parsedSheets;
            xlsxFallbackNames = parsedNames;
          }
        } catch (_zipErr) {
        }

        const wb = XLSX.read(data, { type: "array" });

        function expandMerges(ws: any) {
          const merges = ws["!merges"] || [];
          for (const m of merges) {
            const topLeft = XLSX.utils.encode_cell({ r: m.s.r, c: m.s.c });
            const val = ws[topLeft]?.v;
            if (val === undefined && val !== 0) continue;
            for (let r = m.s.r; r <= m.e.r; r++) {
              for (let c = m.s.c; c <= m.e.c; c++) {
                const addr = XLSX.utils.encode_cell({ r, c });
                if (!ws[addr]) ws[addr] = { t: "s", v: val };
              }
            }
          }
        }

        function fixSheetRange(ws: any) {
          const cellKeys = Object.keys(ws).filter(k => !k.startsWith("!"));
          if (cellKeys.length === 0) return;
          let maxR = 0, maxC = 0;
          for (const k of cellKeys) {
            const decoded = XLSX.utils.decode_cell(k);
            if (decoded.r > maxR) maxR = decoded.r;
            if (decoded.c > maxC) maxC = decoded.c;
          }
          const declaredRef = ws["!ref"];
          if (declaredRef) {
            const declaredRange = XLSX.utils.decode_range(declaredRef);
            if (maxR > declaredRange.e.r || maxC > declaredRange.e.c) {
              ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
            }
          }
        }

        let allRows: any[][] = [];
        let usedSheetName = wb.SheetNames[0];
        let usedSource = "xlsx";

        const PRIORITY_SHEETS = ["order details", "order", "orders", "income", "settlement", "transaction", "transactions", "รายการ"];
        const SKIP_SHEETS = ["fees explanation", "explanation", "คำอธิบาย", "fee description"];

        const prioritySheet = wb.SheetNames.find(sn =>
          PRIORITY_SHEETS.some(ps => sn.toLowerCase().trim().includes(ps))
        );

        if (prioritySheet) {
          const sheet = wb.Sheets[prioritySheet];
          expandMerges(sheet);
          fixSheetRange(sheet);
          allRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });
          usedSheetName = prioritySheet;
        } else {
          for (const sn of wb.SheetNames) {
            if (SKIP_SHEETS.some(sk => sn.toLowerCase().trim().includes(sk))) continue;
            const sheet = wb.Sheets[sn];
            expandMerges(sheet);
            fixSheetRange(sheet);
            const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });
            if (rows.length > allRows.length) {
              allRows = rows;
              usedSheetName = sn;
            }
          }
        }

        if (allRows.length === 0) {
          for (const sn of wb.SheetNames) {
            const sheet = wb.Sheets[sn];
            expandMerges(sheet);
            fixSheetRange(sheet);
            const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });
            if (rows.length > allRows.length) {
              allRows = rows;
              usedSheetName = sn;
            }
          }
        }

        if (xlsxFallbackSheets && xlsxFallbackNames.length > 0) {
          let fbRows: any[][] = [];
          let fbName = xlsxFallbackNames[0];
          const fbPriority = xlsxFallbackNames.find(sn =>
            PRIORITY_SHEETS.some(ps => sn.toLowerCase().trim().includes(ps))
          );
          if (fbPriority && xlsxFallbackSheets[fbPriority]) {
            fbRows = xlsxFallbackSheets[fbPriority];
            fbName = fbPriority;
          } else {
            for (const sn of xlsxFallbackNames) {
              if (SKIP_SHEETS.some(sk => sn.toLowerCase().trim().includes(sk))) continue;
              const rows = xlsxFallbackSheets[sn] || [];
              if (rows.length > fbRows.length) {
                fbRows = rows;
                fbName = sn;
              }
            }
          }
          if (fbRows.length > allRows.length) {
            allRows = fbRows;
            usedSheetName = fbName;
            usedSource = "xml-fallback";
          }
        }

        if (allRows.length < 2) {
          toast({ title: "ไฟล์ว่าง", description: "ไม่พบข้อมูลในไฟล์", variant: "destructive" });
          return;
        }

        const wdSheetName = wb.SheetNames.find(n =>
          n.toLowerCase().includes("withdrawal") || n.includes("ถอน")
        );
        const fbWdName = xlsxFallbackNames.find(n =>
          n.toLowerCase().includes("withdrawal") || n.includes("ถอน")
        );
        {
          let wdData: any[][] = [];
          if (wdSheetName && wb.Sheets[wdSheetName]) {
            fixSheetRange(wb.Sheets[wdSheetName]);
            wdData = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wdSheetName], { header: 1, defval: "" });
          }
          if (wdData.length < 2 && fbWdName && xlsxFallbackSheets?.[fbWdName]) {
            wdData = xlsxFallbackSheets[fbWdName];
          }
          if (wdData.length >= 2) {
            const wdHeaders = (wdData[0] as any[]).map((h: any) => String(h).toLowerCase().trim());
            const refIdx = wdHeaders.findIndex(h => h.includes("reference"));
            const typeIdx = wdHeaders.findIndex(h => h === "type");
            const reqIdx = wdHeaders.findIndex(h => h.includes("request"));
            const amtIdx = wdHeaders.findIndex(h => h === "amount");
            const statusIdx = wdHeaders.findIndex(h => h === "status");
            const successIdx = wdHeaders.findIndex(h => h.includes("success"));
            const bankIdx = wdHeaders.findIndex(h => h.includes("bank"));

            if (refIdx >= 0 && amtIdx >= 0) {
              const parsed: WithdrawalRow[] = [];
              for (let i = 1; i < wdData.length; i++) {
                const row = wdData[i] as any[];
                if (!row || row.length < 3) continue;
                const amt = Number(row[amtIdx] || 0);
                parsed.push({
                  type: String(row[typeIdx] || ""),
                  referenceId: String(row[refIdx] || ""),
                  requestTime: String(row[reqIdx] || ""),
                  amount: amt,
                  status: String(row[statusIdx] || ""),
                  successTime: String(row[successIdx] || ""),
                  bankAccount: String(row[bankIdx] || ""),
                  selected: String(row[statusIdx] || "") === "Transferred" && amt !== 0,
                });
              }
              setWithdrawalRows(parsed);
              setWithdrawalResult(null);
            }
          }
        }

        const rpSheetName = wb.SheetNames.find(n =>
          n.toLowerCase() === "reports" || n.includes("สรุป")
        );
        const fbRpName = xlsxFallbackNames.find(n =>
          n.toLowerCase() === "reports" || n.toLowerCase().includes("report") || n.includes("สรุป")
        );
        {
          let rpData: any[][] = [];
          if (rpSheetName && wb.Sheets[rpSheetName]) {
            fixSheetRange(wb.Sheets[rpSheetName]);
            rpData = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[rpSheetName], { header: 1, defval: "" });
          }
          if (rpData.length < 2 && fbRpName && xlsxFallbackSheets?.[fbRpName]) {
            rpData = xlsxFallbackSheets[fbRpName];
          }
          if (rpData.length >= 2) {
          const findVal = (label: string): number => {
            for (const row of rpData) {
              if (!Array.isArray(row)) continue;
              for (let c = 0; c < row.length; c++) {
                const cell = String(row[c] || "").trim();
                if (cell === label || cell.includes(label)) {
                  for (let v = c + 1; v < row.length; v++) {
                    const val = row[v];
                    if (val !== "" && val !== null && val !== undefined) return Number(val) || 0;
                  }
                }
              }
            }
            return 0;
          };
          const findTimePeriod = (): string => {
            for (const row of rpData) {
              if (!Array.isArray(row)) continue;
              for (let c = 0; c < row.length; c++) {
                if (String(row[c] || "").includes("Time period")) {
                  for (let v = c + 1; v < row.length; v++) {
                    if (row[v]) return String(row[v]);
                  }
                }
              }
            }
            return "";
          };
          const feeBreakdown: { label: string; amount: number }[] = [];
          const feeLabels = [
            "Transaction fee", "TikTok Shop commission fee", "Seller shipping fee",
            "Affiliate Commission", "Affiliate Shop Ads commission",
            "LIVE Specials service fee", "Voucher Xtra service fee",
            "Brands Crazy Deals/Flash Sale service fee", "Commerce growth fee",
            "Infrastructure fee", "Campaign resource fee", "SFP service fee",
            "TikTok PayLater program fee", "EAMS Program service fee",
            "Bonus cashback service fee", "Pre-order service fee",
          ];
          for (const lbl of feeLabels) {
            const v = findVal(lbl);
            if (v !== 0) feeBreakdown.push({ label: lbl, amount: v });
          }

          let wdEarnings = 0;
          let wdWithdrawals = 0;
          if (wdSheetName && wb.Sheets[wdSheetName]) {
            const wdParsed = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wdSheetName], { header: 1, defval: "" });
            const wdH = (wdParsed[0] as any[] || []).map((h: any) => String(h).toLowerCase().trim());
            const tIdx = wdH.findIndex(h => h === "type");
            const aIdx = wdH.findIndex(h => h === "amount");
            if (tIdx >= 0 && aIdx >= 0) {
              for (let i = 1; i < wdParsed.length; i++) {
                const r = wdParsed[i] as any[];
                if (!r) continue;
                const amt = Number(r[aIdx] || 0);
                if (String(r[tIdx]) === "Earnings") wdEarnings += amt;
                else if (String(r[tIdx]) === "Withdrawal") wdWithdrawals += Math.abs(amt);
              }
            }
          }

          setReportSummary({
            timePeriod: findTimePeriod(),
            totalSettlement: findVal("Total settlement amount"),
            totalRevenue: findVal("Total Revenue"),
            totalFees: findVal("Total Fees"),
            totalAdjustments: findVal("Total adjustments"),
            feeBreakdown,
            walletEarnings: wdEarnings,
            walletWithdrawals: wdWithdrawals,
            walletBalance: wdEarnings - wdWithdrawals,
          });
          }
        }

        let bestHeaderRow = -1;
        let bestMapping: ColumnMapping = { ...EMPTY_MAPPING };
        let bestMappedCount = 0;
        let widestRow = -1;
        let widestNonEmpty = 0;

        const maxScan = Math.min(allRows.length - 1, 30);
        for (let r = 0; r < maxScan; r++) {
          const row = allRows[r];
          if (!Array.isArray(row)) continue;
          const nonEmpty = row.filter((c: any) => {
            const s = String(c ?? "").trim();
            return s !== "" && s !== "0" && s !== "0.00";
          });

          if (nonEmpty.length > widestNonEmpty) {
            widestNonEmpty = nonEmpty.length;
            widestRow = r;
          }

          if (nonEmpty.length < 3) continue;

          const testHeaders = row.map((c: any) => String(c ?? "").trim());
          const testMapping = autoDetectMapping(testHeaders, platform as Platform);
          const count = Object.values(testMapping).filter(v => v).length;
          if (count > bestMappedCount) {
            bestMappedCount = count;
            bestMapping = testMapping;
            bestHeaderRow = r;
          }
        }

        if (bestMappedCount === 0 && widestRow >= 0 && widestNonEmpty >= 3) {
          bestHeaderRow = widestRow;
          const wRow = allRows[widestRow];
          const wHeaders = (wRow as any[]).map((c: any) => String(c ?? "").trim());
          const tryMap = autoDetectMapping(wHeaders, platform as Platform);
          const cnt = Object.values(tryMap).filter(v => v).length;
          if (cnt > bestMappedCount) {
            bestMappedCount = cnt;
            bestMapping = tryMap;
          }
        }

        if (bestHeaderRow < 0) {
          bestHeaderRow = widestRow >= 0 ? widestRow : 0;
        }

        const headerRow = allRows[bestHeaderRow];
        const finalHeaders = (headerRow as any[]).map((c: any, i: number) => {
          const v = String(c || "").trim();
          return v || `_col_${i + 1}`;
        });
        const dataRows = allRows.slice(bestHeaderRow + 1)
          .filter(row => Array.isArray(row) && row.some((c: any) => c !== "" && c !== null && c !== undefined))
          .map(row => {
            const obj: Record<string, any> = {};
            finalHeaders.forEach((h, i) => { obj[h] = (row as any[])[i] ?? ""; });
            return obj;
          });

        if (dataRows.length === 0) {
          toast({ title: "ไม่พบข้อมูล", description: "ไม่พบแถวข้อมูลในไฟล์", variant: "destructive" });
          return;
        }

        const cleanHeaders = finalHeaders.filter(h => !h.startsWith("_col_"));
        setHeaders(cleanHeaders.length > 0 ? cleanHeaders : finalHeaders);
        setRawData(dataRows);

        const rowSummaries: string[] = [];
        const showRows = Math.min(allRows.length, 10);
        for (let r = 0; r < showRows; r++) {
          const row = allRows[r];
          if (!Array.isArray(row)) continue;
          const cells = row.map((c: any) => String(c ?? "").trim()).filter(Boolean);
          rowSummaries.push(`แถว ${r}: [${cells.length} เซลล์] ${cells.slice(0, 5).join(" | ")}${cells.length > 5 ? " ..." : ""}`);
        }
        setDebugInfo(`ชีท: "${usedSheetName}" (${wb.SheetNames.length} ชีท) | ${allRows.length} แถว | header=แถว ${bestHeaderRow} | widest=แถว ${widestRow} (${widestNonEmpty} เซลล์) | parser=${usedSource}\n${rowSummaries.join("\n")}`);

        const detected = bestMappedCount > 0 ? bestMapping : autoDetectMapping(cleanHeaders, platform as Platform);
        setMapping(detected);

        const autoMappedCount = Object.values(detected).filter(v => v).length;
        const hasFee = !!(detected.commissionFee || detected.serviceFee || detected.transactionFee);
        if (autoMappedCount >= 4 && detected.orderId && detected.settlementAmount && hasFee) {
          toast({
            title: `จับคู่อัตโนมัติสำเร็จ ${autoMappedCount}/${Object.keys(FIELD_LABELS).length} คอลัมน์`,
            description: `พบ header ที่แถว ${bestHeaderRow + 1}, ${dataRows.length} รายการ`,
          });
          setStep("preview");
          const autoRows = dataRows.map(row => ({
            orderId: String(row[detected.orderId] || ""),
            productAmount: Number(row[detected.productAmount]) || 0,
            shippingFee: Number(row[detected.shippingFee]) || 0,
            sellerDiscount: Number(row[detected.sellerDiscount]) || 0,
            platformDiscount: Number(row[detected.platformDiscount]) || 0,
            commissionFee: Number(row[detected.commissionFee]) || 0,
            serviceFee: Number(row[detected.serviceFee]) || 0,
            transactionFee: Number(row[detected.transactionFee]) || 0,
            infraFee: Number(row[detected.infraFee]) || 0,
            shippingDeduction: Number(row[detected.shippingDeduction]) || 0,
            platformShippingSubsidy: Number(row[detected.platformShippingSubsidy]) || 0,
            adjustments: Number(row[detected.adjustments]) || 0,
            buyerRefund: Number(row[detected.buyerRefund]) || 0,
            sellerShippingPromo: Number(row[detected.sellerShippingPromo]) || 0,
            returnShipping: Number(row[detected.returnShipping]) || 0,
            withholdingTax: Number(row[detected.withholdingTax]) || 0,
            adsDeduction: Number(row[detected.adsDeduction]) || 0,
            settlementAmount: Number(row[detected.settlementAmount]) || 0,
            settleDate: detected.settleDate ? parseExcelDate(row[detected.settleDate]) : "",
          })).filter(r => r.orderId || r.settlementAmount);
          runValidation(autoRows);
        } else {
          toast({
            title: autoMappedCount > 0 ? `จับคู่ได้ ${autoMappedCount}/${Object.keys(FIELD_LABELS).length} คอลัมน์` : "ต้องจับคู่คอลัมน์ด้วยตนเอง",
            description: `พบ header ที่แถว ${bestHeaderRow + 1}, ${dataRows.length} รายการ กรุณาเลือกคอลัมน์ที่ตรงกัน`,
          });
          setStep("mapping");
        }
      } catch {
        toast({ title: "อ่านไฟล์ไม่ได้", description: "ไฟล์อาจไม่ใช่ Excel/CSV", variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      const items = parsedRows.map(r => ({
        platformOrderId: r.orderId,
        orderNo: r.orderId,
        productAmount: r.productAmount,
        shippingFee: r.shippingFee,
        sellerDiscount: r.sellerDiscount,
        platformDiscount: r.platformDiscount,
        commissionFee: r.commissionFee,
        serviceFee: r.serviceFee,
        paymentFee: r.transactionFee,
        shippingCost: r.shippingDeduction,
        platformShippingSubsidy: r.platformShippingSubsidy,
        otherFees: r.infraFee,
        adjustments: r.adjustments,
        buyerRefund: r.buyerRefund,
        sellerShippingPromo: r.sellerShippingPromo,
        returnShipping: r.returnShipping,
        withholdingTax: r.withholdingTax,
        adsDeduction: r.adsDeduction,
        netAmount: r.settlementAmount,
        itemType: "order",
        settleDate: r.settleDate || "",
      }));
      const res = await fetch("/api/ecommerce/settlement-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          companyId: selectedCompanyId,
          platform,
          settlementDate: hasSettleDates ? "" : settlementDate,
          settlementNo,
          autoCreateJournal: autoJournal,
          dailyGrouping: hasSettleDates,
          importSource: fileName || "excel",
          items,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "นำเข้าไม่สำเร็จ");
      }
      const settleResult = await res.json();

      let withdrawResult = null;
      const selectedWithdrawals = withdrawalRows.filter(r => r.selected);
      if (selectedWithdrawals.length > 0 && bankAccountCode) {
        const wdRes = await fetch("/api/ecommerce/withdrawal-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            companyId: selectedCompanyId,
            bankAccountCode,
            platform: platform || "tiktok",
            withdrawals: selectedWithdrawals.map(r => ({
              type: r.type,
              referenceId: r.referenceId,
              requestTime: r.requestTime,
              amount: Math.abs(r.amount),
              status: r.status,
              successTime: r.successTime,
            })),
          }),
        });
        if (wdRes.ok) {
          withdrawResult = await wdRes.json();
        }
      }

      return { settleResult, withdrawResult };
    },
    onSuccess: ({ settleResult, withdrawResult }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ecommerce/settlement-batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ecommerce/orders"] });
      const matchMsg = settleResult?.matchedOrderCount != null
        ? ` (จับคู่ออเดอร์ได้ ${settleResult.matchedOrderCount}/${settleResult.matchedOrderCount + settleResult.unmatchedOrderCount})`
        : "";
      const journalMsg = settleResult?.journalCount > 1 ? ` สร้างรายการบัญชี ${settleResult.journalCount} รายการ` : "";
      const wdMsg = withdrawResult
        ? ` | ถอนเงิน ฿${withdrawResult.totalAmount?.toLocaleString("th-TH", { minimumFractionDigits: 2 }) || "0.00"}`
        : "";
      toast({ title: "นำเข้าสำเร็จ", description: `บันทึก ${parsedRows.length} รายการ${matchMsg}${journalMsg}${wdMsg}` });
      navigate("/ecommerce/settlements");
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const withdrawalMutation = useMutation({
    mutationFn: async () => {
      const selected = withdrawalRows.filter(r => r.selected);
      if (selected.length === 0) throw new Error("กรุณาเลือกรายการถอนเงิน");
      if (!bankAccountCode) throw new Error("กรุณาเลือกบัญชีธนาคาร");
      if (!selectedCompanyId) throw new Error("กรุณาเลือกบริษัท");

      const res = await fetch("/api/ecommerce/withdrawal-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          companyId: selectedCompanyId,
          bankAccountCode,
          platform: platform || "tiktok",
          withdrawals: selected.map(r => ({
            type: r.type,
            referenceId: r.referenceId,
            requestTime: r.requestTime,
            amount: Math.abs(r.amount),
            status: r.status,
            successTime: r.successTime,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "บันทึกถอนเงินไม่สำเร็จ");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/journal-entries"] });
      setWithdrawalResult(data);
      toast({ title: data.message });
    },
    onError: (err: any) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const withdrawalSelected = withdrawalRows.filter(r => r.selected);
  const withdrawalTotal = withdrawalSelected.reduce((s, r) => s + Math.abs(r.amount), 0);

  const resetAll = () => {
    setStep("platform");
    setPlatform("");
    setFileName("");
    setHeaders([]);
    setRawData([]);
    setMapping({ ...EMPTY_MAPPING });
    setSettlementNo("");
    setWithdrawalRows([]);
    setWithdrawalResult(null);
    setBankAccountCode("");
    setReportSummary(null);
  };

  return (
    <EcommerceLayout>
      <div className="space-y-4" data-testid="page-settlement-import">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/ecommerce/settlements")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-1" /> กลับ
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-800" data-testid="text-page-title">นำเข้ารายงาน Settlement</h1>
            <p className="text-xs text-muted-foreground">นำเข้าข้อมูลการรับเงินจากไฟล์ Excel/CSV ของแพลตฟอร์ม</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm">
          {(["platform", "upload", "mapping", "preview"] as Step[]).map((s, i) => {
            const labels = ["เลือกแพลตฟอร์ม", "อัพโหลดไฟล์", "จับคู่คอลัมน์", "ตรวจสอบ & นำเข้า"];
            const icons = [Settings2, Upload, Columns, Eye];
            const Icon = icons[i];
            const isActive = step === s;
            const stepIdx = ["platform", "upload", "mapping", "preview"].indexOf(step);
            const isDone = i < stepIdx;
            return (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <ArrowRight className="h-3 w-3 text-gray-300" />}
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    isActive ? "bg-orange-100 text-orange-700 border border-orange-300" :
                    isDone ? "bg-green-100 text-green-700 border border-green-300" :
                    "bg-gray-100 text-gray-400 border border-gray-200"
                  }`}
                  data-testid={`step-${s}`}
                >
                  {isDone ? <CheckCircle2 className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                  {labels[i]}
                </div>
              </div>
            );
          })}
        </div>

        {step === "platform" && (
          <Card className="rounded-xl shadow-sm border">
            <CardHeader className="pb-2 pt-4 px-5">
              <h2 className="text-base font-semibold">เลือกแพลตฟอร์ม</h2>
              <p className="text-xs text-muted-foreground">เลือกแพลตฟอร์มที่ต้องการนำเข้ารายงาน Settlement</p>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {PLATFORMS_LIST.map(p => (
                  <button
                    key={p.value}
                    className={`p-5 rounded-xl border-2 text-center transition-all cursor-pointer ${
                      platform === p.value ? "ring-2 ring-offset-2 ring-orange-400 border-orange-400" : p.bg
                    }`}
                    onClick={() => setPlatform(p.value)}
                    data-testid={`select-platform-${p.value}`}
                  >
                    <div className="text-2xl font-bold mb-1" style={{ color: p.color }}>{p.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.value === "other" ? "กำหนดเอง" : "รองรับ Auto-Mapping"}
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex justify-end mt-4">
                <Button
                  onClick={() => setStep("upload")}
                  disabled={!platform}
                  data-testid="button-next-upload"
                >
                  ถัดไป <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "upload" && selectedCompany && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex items-center gap-3" data-testid="banner-company-confirm">
            <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <Store className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-amber-700 font-medium">กำลังนำเข้า Settlement เข้าบริษัท:</p>
              <p className="text-base font-bold text-amber-900" data-testid="text-import-company-name">{selectedCompany.name}</p>
            </div>
          </div>
        )}

        {step === "upload" && (
          <Card className="rounded-xl shadow-sm border">
            <CardHeader className="pb-2 pt-4 px-5">
              <div className="flex items-center gap-2">
                <Badge className="bg-orange-100 text-orange-700">{PLATFORMS_LIST.find(p => p.value === platform)?.label}</Badge>
                <h2 className="text-base font-semibold">อัพโหลดไฟล์ Excel / CSV</h2>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="text-center py-10">
                <FileSpreadsheet className="h-16 w-16 text-orange-400 mx-auto mb-4" />
                <p className="text-sm text-muted-foreground mb-4">
                  อัพโหลดไฟล์ Settlement Report ที่ดาวน์โหลดจาก{" "}
                  {PLATFORMS_LIST.find(p => p.value === platform)?.label || "แพลตฟอร์ม"}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileSelect}
                  data-testid="input-file"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-orange-500 hover:bg-orange-600 text-white rounded-full px-8"
                  disabled={!selectedCompanyId}
                  data-testid="button-upload-file"
                >
                  <Upload className="h-4 w-4 mr-2" /> เลือกไฟล์
                </Button>
                {!selectedCompanyId && <p className="text-sm text-red-500 mt-3">กรุณาเลือกบริษัทก่อน</p>}
              </div>
              <div className="flex justify-between mt-2">
                <Button variant="outline" size="sm" onClick={() => setStep("platform")} data-testid="button-back-platform">
                  <ArrowLeft className="h-4 w-4 mr-1" /> กลับ
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "mapping" && (
          <Card className="rounded-xl shadow-sm border">
            <CardHeader className="pb-2 pt-4 px-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Columns className="h-5 w-5 text-orange-500" />
                  <h2 className="text-base font-semibold">จับคู่คอลัมน์</h2>
                  <Badge className="bg-blue-100 text-blue-700">{fileName}</Badge>
                  <Badge className="bg-green-100 text-green-700">{rawData.length} แถว</Badge>
                </div>
                <Badge className={mappedCount >= 3 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}>
                  จับคู่ได้ {mappedCount}/{Object.keys(FIELD_LABELS).length} คอลัมน์
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">ระบบจับคู่คอลัมน์อัตโนมัติแล้ว ตรวจสอบหรือเปลี่ยนแปลงได้ด้านล่าง</p>
              {headers.length > 0 && mappedCount === 0 && (
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs font-medium text-amber-800 mb-1">คอลัมน์ที่พบในไฟล์ ({headers.length} คอลัมน์):</p>
                  <div className="flex flex-wrap gap-1">
                    {headers.map((h, i) => (
                      <span key={i} className="text-[10px] bg-white border border-amber-300 text-amber-900 px-1.5 py-0.5 rounded">{h}</span>
                    ))}
                  </div>
                  {debugInfo && (
                    <pre className="text-[10px] text-amber-700 mt-2 whitespace-pre-wrap font-mono bg-amber-100/50 p-1.5 rounded">{debugInfo}</pre>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(Object.keys(FIELD_LABELS) as (keyof ColumnMapping)[]).map(field => (
                  <div key={field} className="flex items-center gap-2">
                    <label className="text-sm w-40 shrink-0 text-right">{getFieldLabel(field, platform)}:</label>
                    <Select
                      value={mapping[field] || "__none__"}
                      onValueChange={v => setMapping(prev => ({ ...prev, [field]: v === "__none__" ? "" : v }))}
                    >
                      <SelectTrigger className="flex-1 h-8 text-sm" data-testid={`select-map-${field}`}>
                        <SelectValue placeholder="-- ไม่เลือก --" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- ไม่เลือก --</SelectItem>
                        {headers.map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {mapping[field] && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-4">
                <Button variant="outline" size="sm" onClick={() => { setStep("upload"); setHeaders([]); setRawData([]); setMapping({ ...EMPTY_MAPPING }); setFileName(""); }} data-testid="button-back-upload">
                  <ArrowLeft className="h-4 w-4 mr-1" /> เปลี่ยนไฟล์
                </Button>
                <Button
                  onClick={() => { setStep("preview"); runValidation(parsedRows); }}
                  disabled={!mapping.settlementAmount && !mapping.orderId}
                  data-testid="button-next-preview"
                >
                  ดูตัวอย่าง <Eye className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 px-1">
              <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
              <p className="text-xs font-medium text-blue-800">จับคู่คอลัมน์อัตโนมัติ ({mappedCount}/{Object.keys(FIELD_LABELS).length})</p>
              <Button variant="link" size="sm" className="text-blue-700 p-0 h-auto text-xs" onClick={() => setStep("mapping")} data-testid="button-review-mapping">
                แก้ไขการจับคู่คอลัมน์
              </Button>
            </div>

            {reportSummary && (
              <Card className="rounded-xl shadow-sm border border-purple-200" data-testid="card-report-crosscheck">
                <CardHeader className="pb-2 pt-4 px-5">
                  <div className="flex items-center gap-2">
                    <Calculator className="h-5 w-5 text-purple-600" />
                    <h2 className="text-base font-semibold">Cross-check กับชีท Reports</h2>
                    {reportSummary.timePeriod && (
                      <Badge variant="outline" className="text-xs">{reportSummary.timePeriod}</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-4">
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    {(() => {
                      const orderTotal = totals.settlementAmount;
                      const diff = Math.abs(orderTotal - reportSummary.totalSettlement);
                      const isMatch = diff < 1;
                      return (
                        <div className={`rounded-lg px-3 py-2.5 border ${isMatch ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                          <div className="text-xs text-muted-foreground">Total Settlement</div>
                          <div className="text-sm font-bold mt-0.5">Reports: ฿{reportSummary.totalSettlement.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
                          <div className="text-sm mt-0.5">Order: ฿{orderTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
                          <div className={`text-xs font-semibold mt-1 flex items-center gap-1 ${isMatch ? "text-green-700" : "text-red-700"}`}>
                            {isMatch ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />}
                            {isMatch ? "ตรงกัน" : `ต่าง ฿${diff.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`}
                          </div>
                        </div>
                      );
                    })()}
                    <div className="rounded-lg px-3 py-2.5 border bg-red-50 border-red-200">
                      <div className="text-xs text-muted-foreground">Total Fees</div>
                      <div className="text-base font-bold text-red-700 mt-0.5">฿{reportSummary.totalFees.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div className="rounded-lg px-3 py-2.5 border bg-blue-50 border-blue-200">
                      <div className="text-xs text-muted-foreground">Total Revenue</div>
                      <div className="text-base font-bold text-blue-700 mt-0.5">฿{reportSummary.totalRevenue.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="rounded-lg px-3 py-2.5 border bg-purple-50 border-purple-200">
                      <div className="text-xs text-muted-foreground">Total Adjustments</div>
                      <div className="text-base font-bold text-purple-700 mt-0.5">฿{reportSummary.totalAdjustments.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
                    </div>
                    {(reportSummary.walletEarnings > 0 || reportSummary.walletWithdrawals > 0) && (
                      <>
                        <div className="rounded-lg px-3 py-2.5 border bg-green-50 border-green-200">
                          <div className="text-xs text-muted-foreground">Wallet รับเข้า</div>
                          <div className="text-sm font-bold text-green-700 mt-0.5">฿{reportSummary.walletEarnings.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
                          <div className="text-xs text-muted-foreground mt-1">ถอนออก</div>
                          <div className="text-sm font-bold text-orange-700 mt-0.5">฿{reportSummary.walletWithdrawals.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
                        </div>
                        <div className="rounded-lg px-3 py-2.5 border bg-cyan-50 border-cyan-200">
                          <div className="text-xs text-muted-foreground">Wallet คงเหลือ</div>
                          <div className="text-base font-bold text-cyan-700 mt-0.5">฿{reportSummary.walletBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
                        </div>
                      </>
                    )}
                  </div>

                  {reconciliation.unmappedColumns.length > 0 && (
                    <div className="mb-3 border border-amber-300 rounded-lg bg-amber-50 p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                        <span className="text-xs font-semibold text-amber-800">
                          คอลัมน์ที่ยังไม่ได้ map ({reconciliation.unmappedColumns.length} คอลัมน์) — ยอดรวมอาจเป็นสาเหตุของผลต่าง
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 max-h-48 overflow-y-auto">
                        {reconciliation.unmappedColumns.map((col, i) => (
                          <div key={i} className="flex justify-between text-xs py-0.5">
                            <span className="text-amber-900 truncate mr-2" title={col.header}>{col.header}</span>
                            <span className={`font-mono font-medium whitespace-nowrap ${col.total < 0 ? "text-red-600" : "text-green-600"}`}>
                              {col.total > 0 ? "+" : ""}{fmt(col.total)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between text-xs font-bold border-t border-amber-300 mt-1.5 pt-1.5 text-amber-900">
                        <span>รวมคอลัมน์ที่ไม่ได้ map</span>
                        <span className="font-mono">{fmt(reconciliation.unmappedColumns.reduce((s, c) => s + c.total, 0))}</span>
                      </div>
                    </div>
                  )}

                  {reportSummary.feeBreakdown.length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-xs text-purple-600 font-medium hover:text-purple-800">
                        รายละเอียดค่าธรรมเนียม ({reportSummary.feeBreakdown.length} รายการ)
                      </summary>
                      <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
                        {reportSummary.feeBreakdown.map((f, i) => (
                          <div key={i} className="flex justify-between text-xs py-0.5">
                            <span className="text-muted-foreground truncate mr-2">{f.label}</span>
                            <span className={`font-medium ${f.amount < 0 ? "text-red-600" : "text-green-600"}`}>
                              ฿{f.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </CardContent>
              </Card>
            )}

            {validating && (
              <Card className="rounded-xl shadow-sm border border-blue-200 bg-blue-50/50">
                <CardContent className="p-3 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                  <p className="text-xs text-blue-700">กำลังตรวจสอบออเดอร์กับฐานข้อมูล...</p>
                </CardContent>
              </Card>
            )}

            {validation && !validating && (
              <Card className={`rounded-xl shadow-sm border ${
                (validation.crossPeriod.length > 0 || validation.alreadySettled > 0 || validation.notFound > 0)
                  ? "border-amber-300 bg-amber-50/50" : "border-green-200 bg-green-50/50"
              }`}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    {(validation.crossPeriod.length > 0 || validation.alreadySettled > 0 || validation.notFound > 0) ? (
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    )}
                    <p className="text-xs font-medium">
                      ผลตรวจสอบ: จับคู่ได้ {validation.matched}/{validation.total} ออเดอร์
                    </p>
                  </div>

                  {validation.crossPeriod.length > 0 && (
                    <div className="bg-amber-100/70 rounded-lg p-2.5" data-testid="alert-cross-period">
                      <p className="text-xs font-semibold text-amber-800 mb-1">⚠️ พบออเดอร์ข้ามเดือน</p>
                      {validation.crossPeriod.map((cp) => {
                        const [y, m] = cp.month.split("-");
                        const thaiMonth = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][Number(m) - 1];
                        const beYear = Number(y) + 543;
                        return (
                          <div key={cp.month} className="text-xs text-amber-700 flex items-center gap-1">
                            <span>• ออเดอร์จาก {thaiMonth} {beYear}: {cp.count} ออเดอร์ (฿{cp.totalAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })})</span>
                          </div>
                        );
                      })}
                      <p className="text-[10px] text-amber-600 mt-1">ปกติไฟล์ Settlement จะมีออเดอร์จากเดือนก่อนหน้าปนอยู่ — ตรวจสอบว่าถูกต้องก่อนนำเข้า</p>
                    </div>
                  )}

                  {validation.alreadySettled > 0 && (
                    <div className="bg-red-100/70 rounded-lg p-2.5" data-testid="alert-already-settled">
                      <p className="text-xs font-semibold text-red-800">🔴 พบ {validation.alreadySettled} ออเดอร์ที่ Settle แล้ว</p>
                      {validation.alreadySettledIds && validation.alreadySettledIds.length > 0 && (
                        <p className="text-[10px] text-red-600 mt-0.5">เช่น: {validation.alreadySettledIds.slice(0, 5).join(", ")}{validation.alreadySettled > 5 ? " ..." : ""}</p>
                      )}
                      <p className="text-[10px] text-red-600 mt-0.5">ออเดอร์เหล่านี้จะถูก Settle ซ้ำ — กรุณาตรวจสอบ</p>
                    </div>
                  )}

                  {validation.notFound > 0 && (
                    <div className="bg-orange-100/70 rounded-lg p-2.5" data-testid="alert-not-found">
                      <p className="text-xs font-semibold text-orange-800">⚠️ ไม่พบ {validation.notFound} ออเดอร์ในระบบ — จะไม่สร้างรายการบัญชี</p>
                      {validation.notFoundIds && validation.notFoundIds.length > 0 && (
                        <p className="text-[10px] text-orange-600 mt-0.5">เช่น: {validation.notFoundIds.slice(0, 5).join(", ")}{validation.notFound > 5 ? " ..." : ""}</p>
                      )}
                      <p className="text-[10px] text-orange-700 mt-1 leading-relaxed">
                        ออเดอร์เหล่านี้ยังไม่มีรายการขาย/ลูกหนี้ในระบบ ระบบจะข้ามไม่สร้างบัญชีให้ — ต้อง Import ออเดอร์เข้าระบบก่อนแล้วค่อย Settle ใหม่
                      </p>
                    </div>
                  )}

                  {validation.duplicateInFile > 0 && (
                    <div className="bg-blue-100/70 rounded-lg p-2.5">
                      <p className="text-xs font-semibold text-blue-700">ℹ️ พบออเดอร์ซ้ำในไฟล์ {validation.duplicateInFile} รายการ</p>
                      {validation.duplicateIds && validation.duplicateIds.length > 0 && (
                        <p className="text-[10px] text-blue-600 mt-0.5">เช่น: {validation.duplicateIds.slice(0, 5).join(", ")}{validation.duplicateInFile > 5 ? " ..." : ""}</p>
                      )}
                      <p className="text-[10px] text-blue-600 mt-0.5">ระบบจะใช้เฉพาะรายการแรกของแต่ละออเดอร์</p>
                    </div>
                  )}

                  {validation.crossPeriod.length === 0 && validation.alreadySettled === 0 && validation.notFound === 0 && (
                    <p className="text-xs text-green-700">✓ ออเดอร์ทั้งหมดตรงกับเดือนที่ Settlement และยังไม่เคย Settle</p>
                  )}
                </CardContent>
              </Card>
            )}

            {hasSettleDates && dailySummary.length > 0 && (
              <Card className="rounded-xl shadow-sm border border-violet-200 bg-violet-50/50">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <CalendarIcon className="h-4 w-4 text-violet-600 shrink-0" />
                    <p className="text-xs font-semibold text-violet-800">สรุปรายวัน — จะสร้างรายการบัญชี {dailySummary.length} รายการ (แยกตามวันที่ Settle)</p>
                  </div>
                  <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                    {dailySummary.map(({ date, count, total, orders }) => {
                      const displayDate = date === "(ไม่ระบุวันที่)" ? date : (() => {
                        const [y, m, d] = date.split("-");
                        const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
                        return `${Number(d)} ${thaiMonths[Number(m) - 1]} ${Number(y) + 543}`;
                      })();
                      return (
                        <div key={date} className="bg-white/80 rounded-lg p-2 border border-violet-100">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-violet-900">{displayDate}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-500">{count} ออเดอร์</span>
                              <span className="text-xs font-semibold text-violet-700">฿{total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5 truncate" title={orders.join(", ")}>
                            {orders.slice(0, 5).join(", ")}{orders.length > 5 ? ` +${orders.length - 5} อื่นๆ` : ""}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className={`rounded-xl shadow-sm border ${!hasSettleDates && !settlementDate ? 'border-red-300 bg-red-50/30' : ''}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className="bg-orange-100 text-orange-700">{PLATFORMS_LIST.find(p => p.value === platform)?.label}</Badge>
                  <Badge className="bg-blue-100 text-blue-700">{fileName}</Badge>
                  <Badge className="bg-green-100 text-green-700">{parsedRows.length} รายการ</Badge>
                  {hasSettleDates && <Badge className="bg-violet-100 text-violet-700">{dailySummary.length} วัน (สรุปรายวัน)</Badge>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                  {!hasSettleDates && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">
                        วันที่ Settlement <span className="text-red-500">*</span>
                      </label>
                      <ThaiDateInput
                        value={settlementDate}
                        onChange={setSettlementDate}
                        dateEra={dateEra}
                        dateFmt={dateFmt}
                        className="w-full"
                        data-testid="input-settlement-date"
                      />
                      {!settlementDate && (
                        <p className="text-xs text-red-500 mt-1">กรุณาเลือกวันที่</p>
                      )}
                    </div>
                  )}
                  {hasSettleDates && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">วันที่ Settlement</label>
                      <p className="text-sm text-violet-700 pt-1">ใช้วันที่จากไฟล์ ({dailySummary.length} วัน)</p>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">เลขที่ Settlement</label>
                    <Input
                      value={settlementNo}
                      onChange={e => setSettlementNo(e.target.value)}
                      placeholder="STL-0001"
                      className="h-9 text-sm"
                      data-testid="input-settlement-no"
                    />
                  </div>
                  <div className="flex items-end pb-1">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={autoJournal}
                        onCheckedChange={v => setAutoJournal(!!v)}
                        data-testid="checkbox-auto-journal"
                      />
                      <label className="text-sm whitespace-nowrap">สร้างรายการบัญชีอัตโนมัติ</label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {parsedRows.length > 0 && (
              <Card className="rounded-xl shadow-sm border" data-testid="card-reconciliation">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Calculator className="h-4 w-4" />
                    สรุปกระทบยอด (Reconciliation)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-green-700 mb-2 border-b pb-1">รายการบวก (Credits)</p>
                      {reconciliation.credits.map((c, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className={c.mapped ? "text-gray-700" : "text-gray-400"}>
                            {c.label} {!c.mapped && <span className="text-[10px]">(ไม่ได้ map)</span>}
                          </span>
                          <span className="font-mono text-green-700">{c.amount ? fmt(c.amount) : "-"}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs font-semibold border-t pt-1 mt-1">
                        <span>รวมรายการบวก</span>
                        <span className="font-mono text-green-700">{fmt(reconciliation.totalCredits)}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-red-600 mb-2 border-b pb-1">รายการหัก (Deductions)</p>
                      {reconciliation.debits.map((d, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className={d.mapped ? "text-gray-700" : "text-gray-400"}>
                            {d.label} {!d.mapped && <span className="text-[10px]">(ไม่ได้ map)</span>}
                          </span>
                          <span className="font-mono text-red-600">{d.amount ? `-${fmt(d.amount)}` : "-"}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs font-semibold border-t pt-1 mt-1">
                        <span>รวมรายการหัก</span>
                        <span className="font-mono text-red-600">-{fmt(reconciliation.totalDebits)}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-gray-700 mb-2 border-b pb-1">ตรวจสอบยอด</p>
                      <div className="flex justify-between text-xs">
                        <span>รวมรายการบวก</span>
                        <span className="font-mono">{fmt(reconciliation.totalCredits)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>หัก: รวมรายการหัก</span>
                        <span className="font-mono text-red-600">-{fmt(reconciliation.totalDebits)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold border-t pt-1">
                        <span>ยอดสุทธิ (คำนวณ)</span>
                        <span className="font-mono text-blue-700">{fmt(reconciliation.calculatedNet)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold">
                        <span>ยอดที่ได้รับ (จากไฟล์)</span>
                        <span className="font-mono text-green-700">{fmt(reconciliation.fileNet)}</span>
                      </div>
                      {reconciliation.variance !== 0 && (
                        <div className={`flex justify-between text-sm font-bold border-t pt-1 ${Math.abs(reconciliation.variance) > 1 ? "text-red-600" : "text-amber-600"}`}>
                          <span>ผลต่าง</span>
                          <span className="font-mono">{reconciliation.variance > 0 ? "+" : ""}{fmt(reconciliation.variance)}</span>
                        </div>
                      )}
                      {reconciliation.variance === 0 && (
                        <div className="flex items-center gap-1 text-xs text-green-600 font-semibold border-t pt-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          ยอดตรงกัน ไม่มีผลต่าง
                        </div>
                      )}
                      {Math.abs(reconciliation.variance) > 1 && reconciliation.unmappedColumns.length > 0 && (
                        <div className="mt-2 border-t pt-2">
                          <p className="text-xs font-semibold text-red-600 mb-1">
                            คอลัมน์ที่ยังไม่ได้ map ({reconciliation.unmappedColumns.length} คอลัมน์):
                          </p>
                          <div className="max-h-40 overflow-y-auto">
                            <table className="w-full text-xs">
                              <tbody>
                                {reconciliation.unmappedColumns.map((col, i) => (
                                  <tr key={i} className={i % 2 === 0 ? "bg-red-50/50" : ""}>
                                    <td className="py-0.5 pr-2 text-muted-foreground truncate max-w-[200px]" title={col.header}>{col.header}</td>
                                    <td className={`py-0.5 text-right font-mono whitespace-nowrap ${col.total < 0 ? "text-red-600" : "text-green-600"}`}>
                                      {col.total > 0 ? "+" : ""}{fmt(col.total)}
                                    </td>
                                  </tr>
                                ))}
                                <tr className="border-t font-semibold">
                                  <td className="py-0.5 pr-2">รวมคอลัมน์ที่ไม่ได้ map</td>
                                  <td className="py-0.5 text-right font-mono">
                                    {fmt(reconciliation.unmappedColumns.reduce((s, c) => s + c.total, 0))}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      {Math.abs(reconciliation.variance) > 1 && reconciliation.unmappedColumns.length === 0 && (
                        <p className="text-[10px] text-red-500 mt-1">
                          ยอดไม่ตรง ทุกคอลัมน์ถูก map แล้ว — อาจมีรายการอื่นที่ไม่ได้จับคู่
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="rounded-xl shadow-sm border overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs bg-gray-50">
                      <TableHead className="text-xs w-12">#</TableHead>
                      <TableHead className="text-xs">เลขออเดอร์</TableHead>
                      {hasSettleDates && <TableHead className="text-xs">วันที่ Settle</TableHead>}
                      <TableHead className="text-xs text-right">ยอดสินค้า</TableHead>
                      <TableHead className="text-xs text-right">ค่าส่ง</TableHead>
                      {totals.sellerDiscount !== 0 && <TableHead className="text-xs text-right">ส่วนลดผู้ขาย</TableHead>}
                      {totals.platformDiscount !== 0 && <TableHead className="text-xs text-right">ส่วนลด PF</TableHead>}
                      {totals.commissionFee !== 0 && <TableHead className="text-xs text-right">คอมมิชชั่น</TableHead>}
                      {totals.serviceFee !== 0 && <TableHead className="text-xs text-right">ค่าบริการ</TableHead>}
                      {totals.transactionFee !== 0 && <TableHead className="text-xs text-right">ค่าธรรมเนียม</TableHead>}
                      {totals.infraFee !== 0 && <TableHead className="text-xs text-right">ค่าโครงสร้าง</TableHead>}
                      {totals.shippingDeduction !== 0 && <TableHead className="text-xs text-right">ค่าส่งหัก</TableHead>}
                      {totals.platformShippingSubsidy !== 0 && <TableHead className="text-xs text-right">ค่าส่งอุดหนุน</TableHead>}
                      {totals.adjustments !== 0 && <TableHead className="text-xs text-right">ปรับปรุง/ชดเชย</TableHead>}
                      {totals.buyerRefund !== 0 && <TableHead className="text-xs text-right">เงินคืนผู้ซื้อ</TableHead>}
                      {totals.sellerShippingPromo !== 0 && <TableHead className="text-xs text-right">โปรค่าส่ง</TableHead>}
                      {totals.returnShipping !== 0 && <TableHead className="text-xs text-right">ค่าส่งคืน</TableHead>}
                      {totals.withholdingTax !== 0 && <TableHead className="text-xs text-right">WHT</TableHead>}
                      {totals.adsDeduction !== 0 && <TableHead className="text-xs text-right">ค่าโฆษณา</TableHead>}
                      <TableHead className="text-xs text-right font-semibold">ยอดที่ได้รับ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.slice(0, 100).map((row, i) => (
                      <TableRow key={i} className="text-sm" data-testid={`row-settlement-${i}`}>
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{row.orderId || "-"}</TableCell>
                        {hasSettleDates && <TableCell className="text-xs">{row.settleDate || "-"}</TableCell>}
                        <TableCell className="text-right text-xs">{fmt(row.productAmount)}</TableCell>
                        <TableCell className="text-right text-xs">{fmt(row.shippingFee)}</TableCell>
                        {totals.sellerDiscount !== 0 && <TableCell className="text-right text-xs text-red-600">{row.sellerDiscount ? `-${fmt(row.sellerDiscount)}` : "-"}</TableCell>}
                        {totals.platformDiscount !== 0 && <TableCell className="text-right text-xs text-orange-600">{row.platformDiscount ? `-${fmt(row.platformDiscount)}` : "-"}</TableCell>}
                        {totals.commissionFee !== 0 && <TableCell className="text-right text-xs text-red-600">{row.commissionFee ? `-${fmt(row.commissionFee)}` : "-"}</TableCell>}
                        {totals.serviceFee !== 0 && <TableCell className="text-right text-xs text-red-600">{row.serviceFee ? `-${fmt(row.serviceFee)}` : "-"}</TableCell>}
                        {totals.transactionFee !== 0 && <TableCell className="text-right text-xs text-red-600">{row.transactionFee ? `-${fmt(row.transactionFee)}` : "-"}</TableCell>}
                        {totals.infraFee !== 0 && <TableCell className="text-right text-xs text-red-600">{row.infraFee ? `-${fmt(row.infraFee)}` : "-"}</TableCell>}
                        {totals.shippingDeduction !== 0 && <TableCell className="text-right text-xs text-red-600">{row.shippingDeduction ? `-${fmt(row.shippingDeduction)}` : "-"}</TableCell>}
                        {totals.platformShippingSubsidy !== 0 && <TableCell className="text-right text-xs text-blue-600">{row.platformShippingSubsidy ? fmt(row.platformShippingSubsidy) : "-"}</TableCell>}
                        {totals.adjustments !== 0 && <TableCell className="text-right text-xs text-purple-600">{row.adjustments ? fmt(row.adjustments) : "-"}</TableCell>}
                        {totals.buyerRefund !== 0 && <TableCell className="text-right text-xs text-pink-600">{row.buyerRefund ? `-${fmt(Math.abs(row.buyerRefund))}` : "-"}</TableCell>}
                        {totals.sellerShippingPromo !== 0 && <TableCell className="text-right text-xs text-amber-600">{row.sellerShippingPromo ? `-${fmt(Math.abs(row.sellerShippingPromo))}` : "-"}</TableCell>}
                        {totals.returnShipping !== 0 && <TableCell className="text-right text-xs text-rose-600">{row.returnShipping ? `-${fmt(Math.abs(row.returnShipping))}` : "-"}</TableCell>}
                        {totals.withholdingTax !== 0 && <TableCell className="text-right text-xs text-slate-600">{row.withholdingTax ? `-${fmt(Math.abs(row.withholdingTax))}` : "-"}</TableCell>}
                        {totals.adsDeduction !== 0 && <TableCell className="text-right text-xs text-violet-600">{row.adsDeduction ? `-${fmt(Math.abs(row.adsDeduction))}` : "-"}</TableCell>}
                        <TableCell className="text-right text-xs font-semibold text-green-700">{fmt(row.settlementAmount)}</TableCell>
                      </TableRow>
                    ))}
                    {parsedRows.length > 100 && (
                      <TableRow>
                        <TableCell colSpan={99} className="text-center text-xs text-muted-foreground py-2">
                          ... แสดง 100 จาก {parsedRows.length} รายการ
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow className="bg-gray-50 font-semibold" data-testid="row-totals">
                      <TableCell className="text-xs">รวม</TableCell>
                      <TableCell className="text-xs">{parsedRows.length} รายการ</TableCell>
                      {hasSettleDates && <TableCell className="text-xs">{dailySummary.length} วัน</TableCell>}
                      <TableCell className="text-right text-xs">{fmt(totals.productAmount)}</TableCell>
                      <TableCell className="text-right text-xs">{fmt(totals.shippingFee)}</TableCell>
                      {totals.sellerDiscount !== 0 && <TableCell className="text-right text-xs text-red-600">-{fmt(totals.sellerDiscount)}</TableCell>}
                      {totals.platformDiscount !== 0 && <TableCell className="text-right text-xs text-orange-600">-{fmt(totals.platformDiscount)}</TableCell>}
                      {totals.commissionFee !== 0 && <TableCell className="text-right text-xs text-red-600">-{fmt(totals.commissionFee)}</TableCell>}
                      {totals.serviceFee !== 0 && <TableCell className="text-right text-xs text-red-600">-{fmt(totals.serviceFee)}</TableCell>}
                      {totals.transactionFee !== 0 && <TableCell className="text-right text-xs text-red-600">-{fmt(totals.transactionFee)}</TableCell>}
                      {totals.infraFee !== 0 && <TableCell className="text-right text-xs text-red-600">-{fmt(totals.infraFee)}</TableCell>}
                      {totals.shippingDeduction !== 0 && <TableCell className="text-right text-xs text-red-600">-{fmt(totals.shippingDeduction)}</TableCell>}
                      {totals.platformShippingSubsidy !== 0 && <TableCell className="text-right text-xs text-blue-600">{fmt(totals.platformShippingSubsidy)}</TableCell>}
                      {totals.adjustments !== 0 && <TableCell className="text-right text-xs text-purple-600">{fmt(totals.adjustments)}</TableCell>}
                      {totals.buyerRefund !== 0 && <TableCell className="text-right text-xs text-pink-600">-{fmt(Math.abs(totals.buyerRefund))}</TableCell>}
                      {totals.sellerShippingPromo !== 0 && <TableCell className="text-right text-xs text-amber-600">-{fmt(Math.abs(totals.sellerShippingPromo))}</TableCell>}
                      {totals.returnShipping !== 0 && <TableCell className="text-right text-xs text-rose-600">-{fmt(Math.abs(totals.returnShipping))}</TableCell>}
                      {totals.withholdingTax !== 0 && <TableCell className="text-right text-xs text-slate-600">-{fmt(Math.abs(totals.withholdingTax))}</TableCell>}
                      {totals.adsDeduction !== 0 && <TableCell className="text-right text-xs text-violet-600">-{fmt(Math.abs(totals.adsDeduction))}</TableCell>}
                      <TableCell className="text-right text-xs font-bold text-green-700">{fmt(totals.settlementAmount)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </Card>

            {parsedRows.length === 0 && (
              <Card className="rounded-xl shadow-sm border">
                <CardContent className="py-8 text-center">
                  <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">ไม่พบข้อมูลที่สามารถนำเข้าได้ กรุณาตรวจสอบการจับคู่คอลัมน์</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setStep("mapping")} data-testid="button-fix-mapping">
                    <Columns className="h-4 w-4 mr-1" /> แก้ไขการจับคู่
                  </Button>
                </CardContent>
              </Card>
            )}

            {withdrawalRows.length > 0 && (
              <Card className="rounded-xl shadow-sm border border-cyan-200">
                <CardHeader className="pb-2 pt-4 px-5">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-[#03c9d7]" />
                    <h2 className="text-base font-semibold">รายการถอนเงิน (Withdrawal Records)</h2>
                    <Badge className="bg-cyan-100 text-cyan-700">{withdrawalRows.length} รายการ</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">พบข้อมูลถอนเงินจากชีท Withdrawal Records ในไฟล์ Excel เดียวกัน</p>
                </CardHeader>
                <CardContent className="px-5 pb-4 space-y-3">
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="flex-1 min-w-[200px]">
                      <label className="text-xs text-gray-500 mb-1 block">
                        <Landmark className="h-3 w-3 inline mr-1" />
                        บัญชีธนาคาร (เดบิต - เงินเข้า)
                      </label>
                      <AccountCombobox
                        accounts={bankAccounts}
                        value={bankAccountCode}
                        onSelect={acc => setBankAccountCode(acc.code)}
                        testId="select-withdrawal-bank"
                        placeholder="เลือกบัญชีธนาคาร"
                      />
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-500">เลือก: </span>
                      <span className="font-semibold">{withdrawalSelected.length} รายการ</span>
                      <span className="mx-2 text-gray-300">|</span>
                      <span className="text-gray-500">ยอดรวม: </span>
                      <span className="font-semibold text-green-600">฿{withdrawalTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <Button
                      className="bg-[#03c9d7] hover:bg-[#03c9d7]/90 text-white"
                      disabled={withdrawalSelected.length === 0 || !bankAccountCode || withdrawalMutation.isPending || !!withdrawalResult}
                      onClick={() => withdrawalMutation.mutate()}
                      data-testid="button-import-withdrawal"
                    >
                      {withdrawalMutation.isPending ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> กำลังบันทึก...</>
                      ) : (
                        <><Wallet className="h-4 w-4 mr-2" /> บันทึกถอนเงิน</>
                      )}
                    </Button>
                  </div>

                  {withdrawalResult && (
                    <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg p-3">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="font-semibold">{withdrawalResult.message}</span>
                      <span className="ml-auto font-bold">฿{withdrawalResult.totalAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}

                  <div className="overflow-x-auto border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="w-10">
                            <Checkbox
                              checked={withdrawalSelected.length === withdrawalRows.filter(r => r.status === "Transferred" && r.amount !== 0).length && withdrawalSelected.length > 0}
                              onCheckedChange={(c) => {
                                setWithdrawalRows(withdrawalRows.map(r => ({
                                  ...r,
                                  selected: r.status === "Transferred" && r.amount !== 0 ? !!c : false,
                                })));
                              }}
                              data-testid="checkbox-withdrawal-all"
                            />
                          </TableHead>
                          <TableHead className="text-xs">ประเภท</TableHead>
                          <TableHead className="text-xs">Reference ID</TableHead>
                          <TableHead className="text-xs">วันที่</TableHead>
                          <TableHead className="text-xs text-right">จำนวนเงิน</TableHead>
                          <TableHead className="text-xs">สถานะ</TableHead>
                          <TableHead className="text-xs">บัญชี</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {withdrawalRows.map((row, idx) => (
                          <TableRow key={idx} className={row.selected ? "bg-cyan-50/50" : ""}>
                            <TableCell>
                              <Checkbox
                                checked={row.selected}
                                disabled={row.status !== "Transferred" || row.amount === 0}
                                onCheckedChange={(c) => {
                                  const updated = [...withdrawalRows];
                                  updated[idx].selected = !!c;
                                  setWithdrawalRows(updated);
                                }}
                                data-testid={`checkbox-withdrawal-${idx}`}
                              />
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-xs ${row.type === "Withdrawal" ? "border-cyan-400 text-cyan-700" : "border-amber-400 text-amber-700"}`}>
                                {row.type === "Withdrawal" ? "ถอนเงิน" : row.type === "Earnings" ? "รายได้เข้า" : row.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{row.referenceId}</TableCell>
                            <TableCell className="text-xs">{row.successTime || row.requestTime}</TableCell>
                            <TableCell className={`text-right text-sm font-semibold ${row.amount < 0 ? "text-red-600" : "text-green-600"}`}>
                              ฿{row.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell>
                              <Badge className={row.status === "Transferred" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>
                                {row.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{row.bankAccount}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-between">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep("mapping")} data-testid="button-back-mapping">
                  <ArrowLeft className="h-4 w-4 mr-1" /> แก้ไขคอลัมน์
                </Button>
                <Button variant="outline" size="sm" onClick={resetAll} data-testid="button-reset">
                  เริ่มใหม่
                </Button>
              </div>
              <Button
                onClick={() => {
                  const companyName = selectedCompany?.name || "";
                  const wdCount = withdrawalRows.filter(r => r.selected).length;
                  const wdLine = wdCount > 0 ? `\n+ ถอนเงิน ${wdCount} รายการ` : "";
                  if (companyName && !confirm(`ยืนยันนำเข้า Settlement เข้าบริษัท:\n"${companyName}"\n\n${parsedRows.length} รายการ settlement${wdLine}\n\nกรุณาตรวจสอบว่าเลือกบริษัทถูกต้อง`)) return;
                  importMutation.mutate();
                }}
                disabled={parsedRows.length === 0 || importMutation.isPending || !selectedCompanyId || (!hasSettleDates && !settlementDate)}
                className="bg-green-600 hover:bg-green-700 text-white rounded-full px-6"
                data-testid="button-import"
              >
                {importMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> กำลังนำเข้า...</>
                ) : (
                  <><Download className="h-4 w-4 mr-2" /> นำเข้า {parsedRows.length} รายการ{withdrawalRows.filter(r => r.selected).length > 0 ? ` + ถอน ${withdrawalRows.filter(r => r.selected).length}` : ""}</>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </EcommerceLayout>
  );
}

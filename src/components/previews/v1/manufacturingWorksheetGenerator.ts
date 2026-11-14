import jsPDF from "jspdf";

export interface ManufacturingWorksheetData {
  orderNumber: string;
  date: string;
  customerName: string;
  orderName: string;
  karat: string;
  weightInGrams?: number;
  size?: string;
  deliveryDate: string;
  selectedProcesses: string[];
  adDetails: Array<{
    adSize: string;
    adPieces: number;
  }>;
  productImage?: string;
}

export const generateManufacturingWorksheetPDF = (
  data: ManufacturingWorksheetData
): jsPDF => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;
  let currentY = margin;

  doc.setLineWidth(0.5);
  doc.setDrawColor(0, 0, 0);

  const headerHeight = 12;
  doc.setFillColor(255, 255, 0);
  doc.rect(margin, currentY, contentWidth, headerHeight, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text("AM Jwellers", pageWidth / 2, currentY + 8, { align: "center" });
  currentY += headerHeight;

  const infoRowHeight = 8;
  const col1Width = 35;
  const col2Width = 45;
  const col3Width = 45;
  const col4Width = 35;
  const col5Width = contentWidth - col1Width - col2Width - col3Width - col4Width;

  doc.setFillColor(255, 255, 255);
  doc.rect(margin, currentY, contentWidth, infoRowHeight, "FD");

  let currentX = margin;
  doc.line(currentX + col1Width, currentY, currentX + col1Width, currentY + infoRowHeight);
  currentX += col1Width;
  doc.line(currentX + col2Width, currentY, currentX + col2Width, currentY + infoRowHeight);
  currentX += col2Width;
  doc.line(currentX + col3Width, currentY, currentX + col3Width, currentY + infoRowHeight);
  currentX += col3Width;
  doc.line(currentX + col4Width, currentY, currentX + col4Width, currentY + infoRowHeight);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  currentX = margin;
  doc.text(`Order no: ${data.orderNumber}`, currentX + 2, currentY + 5);
  currentX += col1Width;
  doc.text(`Date: ${data.date}`, currentX + 2, currentY + 5);
  currentX += col2Width;
  doc.text("Customer Name", currentX + 2, currentY + 5);
  currentX += col3Width;
  doc.text("Order", currentX + 2, currentY + 5);
  currentX += col4Width;
  const sizeText = data.size ? `Size: ${data.size}` : "Size:";
  doc.text(sizeText, currentX + 2, currentY + 5);
  currentY += infoRowHeight;

  doc.rect(margin, currentY, contentWidth, infoRowHeight, "FD");
  currentX = margin;
  doc.line(currentX + col1Width, currentY, currentX + col1Width, currentY + infoRowHeight);
  currentX += col1Width;
  doc.line(currentX + col2Width, currentY, currentX + col2Width, currentY + infoRowHeight);
  currentX += col2Width;
  doc.line(currentX + col3Width, currentY, currentX + col3Width, currentY + infoRowHeight);
  currentX += col3Width;
  doc.line(currentX + col4Width, currentY, currentX + col4Width, currentY + infoRowHeight);

  currentX = margin + col1Width + col2Width;
  doc.setFont("helvetica", "bold");
  doc.text(data.customerName, currentX + 2, currentY + 5);
  currentX += col3Width;
  doc.text(data.orderName, currentX + 2, currentY + 5);
  currentX += col4Width;
  doc.text(`kt: ${data.karat}`, currentX + 2, currentY + 5);
  currentY += infoRowHeight;

  doc.rect(margin, currentY, contentWidth, infoRowHeight, "FD");
  const processColWidth = 35;
  const inColWidth = 35;
  const outColWidth = 35;
  const lossColWidth = 35;

  currentX = margin;
  doc.line(currentX + processColWidth, currentY, currentX + processColWidth, currentY + infoRowHeight);
  currentX += processColWidth;
  doc.line(currentX + inColWidth, currentY, currentX + inColWidth, currentY + infoRowHeight);
  currentX += inColWidth;
  doc.line(currentX + outColWidth, currentY, currentX + outColWidth, currentY + infoRowHeight);
  currentX += outColWidth;
  doc.line(currentX + lossColWidth, currentY, currentX + lossColWidth, currentY + infoRowHeight);

  doc.setFont("helvetica", "bold");
  currentX = margin + processColWidth;
  doc.text("in", currentX + inColWidth / 2, currentY + 5, { align: "center" });
  currentX += inColWidth;
  doc.text("out", currentX + outColWidth / 2, currentY + 5, { align: "center" });
  currentX += outColWidth;
  doc.text("Loss", currentX + lossColWidth / 2, currentY + 5, { align: "center" });
  currentX += lossColWidth;
  doc.setFont("helvetica", "normal");
  doc.text(`Due Date: ${data.deliveryDate}`, currentX + 2, currentY + 5);
  currentY += infoRowHeight;

  const processes = [
    { name: "Filing", isBlue: false, isTotal: false },
    { name: "", isBlue: false, isTotal: false },
    { name: "Free Polish", isBlue: false, isTotal: false },
    { name: "", isBlue: false, isTotal: false },
    { name: "Setting", isBlue: false, isTotal: false },
    { name: "", isBlue: false, isTotal: false },
    { name: "Ad 1-10", isBlue: true, isTotal: false },
    { name: "Ad 1-20", isBlue: true, isTotal: false },
    { name: "Ad 1-30", isBlue: true, isTotal: false },
    { name: "Ad 1-40", isBlue: true, isTotal: false },
    { name: "Ad 1-50", isBlue: true, isTotal: false },
    { name: "Ad 1-60", isBlue: true, isTotal: false },
    { name: "Ad 1-70", isBlue: true, isTotal: false },
    { name: "Ad 1-80", isBlue: true, isTotal: false },
    { name: "KL", isBlue: false, isTotal: false },
    { name: "total", isBlue: false, isTotal: true },
    { name: "Polish", isBlue: false, isTotal: false },
    { name: "", isBlue: false, isTotal: false },
    { name: "Total", isBlue: true, isTotal: true },
  ];

  const rowHeight = 8;
  processes.forEach((process, index) => {
    if (process.isBlue) {
      doc.setFillColor(173, 216, 230);
    } else {
      doc.setFillColor(255, 255, 255);
    }
    doc.rect(margin, currentY, contentWidth, rowHeight, "FD");

    currentX = margin;
    doc.line(currentX + processColWidth, currentY, currentX + processColWidth, currentY + rowHeight);
    currentX += processColWidth;
    doc.line(currentX + inColWidth, currentY, currentX + inColWidth, currentY + rowHeight);
    currentX += inColWidth;
    doc.line(currentX + outColWidth, currentY, currentX + outColWidth, currentY + rowHeight);
    currentX += outColWidth;
    doc.line(currentX + lossColWidth, currentY, currentX + lossColWidth, currentY + rowHeight);

    doc.setFont("helvetica", process.isTotal ? "bold" : "normal");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);

    if (process.name) {
      doc.text(process.name, margin + 2, currentY + 5);
    }

    if (index === 8) {
      currentX = margin + processColWidth + inColWidth + outColWidth + lossColWidth;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 0, 0);
      const wtText = data.weightInGrams ? `WT: ${data.weightInGrams}g` : "WT:";
      doc.text(wtText, currentX + 2, currentY + 5);
      doc.setTextColor(0, 0, 0);
    }

    if (index === 10) {
      currentX = margin + processColWidth + inColWidth + outColWidth + lossColWidth;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text("Finished wt", currentX + 2, currentY + 5);
    }

    currentY += rowHeight;
  });

  if (data.adDetails && data.adDetails.length > 0) {
    currentY += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("AD Stone Details:", margin, currentY);
    currentY += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    data.adDetails.forEach((ad, index) => {
      if (ad.adSize || ad.adPieces > 0) {
        doc.text(
          `${index + 1}. Size: ${ad.adSize} - Pieces: ${ad.adPieces}`,
          margin + 5,
          currentY
        );
        currentY += 5;
      }
    });
  }

  return doc;
};

export const downloadManufacturingWorksheet = (
  data: ManufacturingWorksheetData
): void => {
  const doc = generateManufacturingWorksheetPDF(data);
  const fileName = `Manufacturing_Worksheet_${data.orderNumber}_${data.customerName.replace(
    /\s+/g,
    "_"
  )}.pdf`;
  doc.save(fileName);
};


DELIMITER //
DROP FUNCTION IF EXISTS fn_calculate_daily_rate//
CREATE FUNCTION fn_calculate_daily_rate(monthly_gross DECIMAL(12,2), working_days INT)
RETURNS DECIMAL(12,2) DETERMINISTIC NO SQL
BEGIN
  IF working_days IS NULL OR working_days <= 0 THEN RETURN 0.00; END IF;
  RETURN ROUND(monthly_gross / working_days, 2);
END//

DROP FUNCTION IF EXISTS fn_calculate_monthly_tds//
CREATE FUNCTION fn_calculate_monthly_tds(annual_gross DECIMAL(12,2))
RETURNS DECIMAL(12,2) DETERMINISTIC NO SQL
BEGIN
  DECLARE annual_tax DECIMAL(12,2) DEFAULT 0.00;
  IF annual_gross IS NULL OR annual_gross <= 300000 THEN SET annual_tax = 0;
  ELSEIF annual_gross <= 600000 THEN SET annual_tax = (annual_gross - 300000) * 0.05;
  ELSEIF annual_gross <= 1200000 THEN SET annual_tax = 15000 + ((annual_gross - 600000) * 0.10);
  ELSE SET annual_tax = 75000 + ((annual_gross - 1200000) * 0.20);
  END IF;
  RETURN ROUND(annual_tax / 12, 2);
END//
DELIMITER ;

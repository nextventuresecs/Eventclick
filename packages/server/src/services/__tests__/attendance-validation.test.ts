import { describe, expect, it } from "vitest";
import type { FormField } from "@application/shared";
import { validateAndCoerceData } from "../attendance.service";
import { ApiError } from "../../utils/errors";

describe("validateAndCoerceData - Form Validation and Coercion", () => {
  describe("Date Fields", () => {
    const requiredDateField: FormField = {
      id: "date_req",
      label: "Required Date",
      type: "date",
      required: true,
    };

    const optionalDateField: FormField = {
      id: "date_opt",
      label: "Optional Date",
      type: "date",
      required: false,
    };

    it("parses and accepts valid YYYY-MM-DD date format", () => {
      const result = validateAndCoerceData(
        [requiredDateField, optionalDateField],
        { date_req: "2026-05-17", date_opt: "2026-12-31" }
      );
      expect(result).toEqual({
        date_req: "2026-05-17",
        date_opt: "2026-12-31",
      });
    });

    it("rejects invalid date formats", () => {
      expect(() =>
        validateAndCoerceData([requiredDateField], { date_req: "17-05-2026" })
      ).toThrow(ApiError);

      expect(() =>
        validateAndCoerceData([requiredDateField], { date_req: "2026/05/17" })
      ).toThrow(ApiError);

      expect(() =>
        validateAndCoerceData([requiredDateField], { date_req: "not-a-date" })
      ).toThrow(ApiError);
    });

    it("enforces required constraint on date fields", () => {
      try {
        validateAndCoerceData([requiredDateField], {});
        expect.fail("Should have thrown validation error");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.statusCode).toBe(400);
        expect(apiErr.details).toEqual({ date_req: "required" });
      }

      try {
        validateAndCoerceData([requiredDateField], { date_req: "" });
        expect.fail("Should have thrown validation error");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.details).toEqual({ date_req: "required" });
      }
    });

    it("maps empty optional date values to null", () => {
      const result = validateAndCoerceData(
        [requiredDateField, optionalDateField],
        { date_req: "2026-05-17", date_opt: "" }
      );
      expect(result).toEqual({
        date_req: "2026-05-17",
        date_opt: null,
      });

      const resultNull = validateAndCoerceData(
        [requiredDateField, optionalDateField],
        { date_req: "2026-05-17", date_opt: null }
      );
      expect(resultNull).toEqual({
        date_req: "2026-05-17",
        date_opt: null,
      });

      const resultUndefined = validateAndCoerceData(
        [requiredDateField, optionalDateField],
        { date_req: "2026-05-17" }
      );
      expect(resultUndefined).toEqual({
        date_req: "2026-05-17",
        date_opt: null,
      });
    });
  });

  describe("Select (Dropdown) Fields", () => {
    const requiredSelectField: FormField = {
      id: "select_req",
      label: "Required Choice",
      type: "select",
      required: true,
      options: ["Apple", "Banana", "Cherry"],
    };

    const optionalSelectField: FormField = {
      id: "select_opt",
      label: "Optional Choice",
      type: "select",
      required: false,
      options: ["Dog", "Cat", "Fish"],
    };

    it("accepts valid options", () => {
      const result = validateAndCoerceData(
        [requiredSelectField, optionalSelectField],
        { select_req: "Banana", select_opt: "Cat" }
      );
      expect(result).toEqual({
        select_req: "Banana",
        select_opt: "Cat",
      });
    });

    it("rejects values that are not in the options list", () => {
      try {
        validateAndCoerceData([requiredSelectField], { select_req: "Grape" });
        expect.fail("Should have thrown validation error");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.statusCode).toBe(400);
        // Zod enum validation error message
        expect(apiErr.details).toHaveProperty("select_req");
      }
    });

    it("enforces required constraint on select fields", () => {
      try {
        validateAndCoerceData([requiredSelectField], {});
        expect.fail("Should have thrown validation error");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.details).toEqual({ select_req: "required" });
      }
    });

    it("maps empty optional select values to null", () => {
      const result = validateAndCoerceData(
        [requiredSelectField, optionalSelectField],
        { select_req: "Apple", select_opt: "" }
      );
      expect(result).toEqual({
        select_req: "Apple",
        select_opt: null,
      });
    });
  });

  describe("Checkbox Fields", () => {
    const requiredCheckboxField: FormField = {
      id: "terms",
      label: "Accept Terms",
      type: "checkbox",
      required: true,
    };

    const optionalCheckboxField: FormField = {
      id: "newsletter",
      label: "Subscribe Newsletter",
      type: "checkbox",
      required: false,
    };

    it("parses true and false values successfully", () => {
      const result1 = validateAndCoerceData(
        [requiredCheckboxField, optionalCheckboxField],
        { terms: true, newsletter: false }
      );
      expect(result1).toEqual({
        terms: true,
        newsletter: false,
      });

      const result2 = validateAndCoerceData(
        [requiredCheckboxField, optionalCheckboxField],
        { terms: false, newsletter: true }
      );
      expect(result2).toEqual({
        terms: false,
        newsletter: true,
      });
    });

    it("enforces required constraint (cannot be empty/null/undefined)", () => {
      try {
        validateAndCoerceData([requiredCheckboxField], {});
        expect.fail("Should have thrown validation error");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.details).toEqual({ terms: "required" });
      }
    });

    it("maps empty optional checkbox values to null", () => {
      const result = validateAndCoerceData(
        [requiredCheckboxField, optionalCheckboxField],
        { terms: true }
      );
      expect(result).toEqual({
        terms: true,
        newsletter: null,
      });
    });

    it("rejects non-boolean values", () => {
      expect(() =>
        validateAndCoerceData([requiredCheckboxField], { terms: "true" })
      ).toThrow(ApiError);

      expect(() =>
        validateAndCoerceData([requiredCheckboxField], { terms: 1 })
      ).toThrow(ApiError);
    });
  });

  describe("Standard Fields Compatibility", () => {
    const fields: FormField[] = [
      { id: "name", label: "Name", type: "text", required: true },
      { id: "email", label: "Email", type: "email", required: false },
      { id: "phone", label: "Phone", type: "phone", required: false },
      { id: "age", label: "Age", type: "number", required: false },
    ];

    it("correctly validates and coerces standard text, email, phone, and number", () => {
      const result = validateAndCoerceData(fields, {
        name: "John Doe",
        email: "john@example.com",
        phone: "+1234567890",
        age: 25,
      });

      expect(result).toEqual({
        name: "John Doe",
        email: "john@example.com",
        phone: "+1234567890",
        age: 25,
      });
    });

    it("coerces empty optional standard values to null", () => {
      const result = validateAndCoerceData(fields, {
        name: "John Doe",
        email: "",
        phone: null,
      });

      expect(result).toEqual({
        name: "John Doe",
        email: null,
        phone: null,
        age: null,
      });
    });
  });
});

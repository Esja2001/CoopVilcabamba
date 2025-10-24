/**
 * ==========================================
 * API SERVICE PARA CERTIFICADOS BANCARIOS
 * ==========================================
 * 
 * Servicio especializado para manejar la generación de certificados
 * consolidados con debito de cuenta y generación de PDF
 */

const API_CONFIG = {
  baseUrl: '/api-l/prctrans.php', // URL con 'L' para certificados
  token: '0999SolSTIC20220719',
  timeout: 15000, // 15 segundos (más tiempo para generación de PDF)
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
};

/**
 * Códigos de proceso para certificados
 */
const PROCESS_CODES = {
  GET_CERTIFICATE_COST: '2400',      // Obtener costo del certificado
  GET_DEBIT_ACCOUNTS: '2374',        // Listar cuentas para debitar
  VALIDATE_DEBIT: '2350',            // Validar débito y enviar OTP (similar a transferencias)
  GENERATE_CERTIFICATE: '2401'       // Generar certificado con OTP
};

/**
 * Clase para manejar operaciones de certificados
 */
class ApiServiceCertificados {
  constructor() {
    this.config = API_CONFIG;
    this.processCodes = PROCESS_CODES;
  }

  /**
   * Método genérico para realizar peticiones HTTP
   */
  async makeRequest(data, options = {}) {
    console.log('🔧 [CERT] Configurando petición de certificados...');
    console.log('🌐 [CERT] URL:', this.config.baseUrl);
    console.log('📋 [CERT] Código de proceso:', data.prccode);
    console.log('📦 [CERT] Datos a enviar:', data);

    const requestOptions = {
      method: 'POST',
      headers: {
        ...this.config.headers,
        ...options.headers
      },
      body: JSON.stringify({
        tkn: this.config.token,
        ...data
      })
    };

    console.log('🚀 [CERT] Enviando petición...');

    try {
      // Crear AbortController para timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('⏰ [CERT] Timeout alcanzado, abortando petición...');
        controller.abort();
      }, options.timeout || this.config.timeout);

      requestOptions.signal = controller.signal;

      const response = await fetch(this.config.baseUrl, requestOptions);
      clearTimeout(timeoutId);

      console.log('📊 [CERT] Respuesta recibida:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} - ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ [CERT] Datos parseados correctamente:', result);
      
      return this.handleResponse(result);

    } catch (error) {
      console.error('❌ [CERT] Error en la petición:', error);
      return this.handleError(error);
    }
  }

  /**
   * Manejo estandarizado de respuestas
   */
  handleResponse(result) {
    return {
      success: true,
      data: result,
      message: 'Operación exitosa',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Manejo estandarizado de errores
   */
  handleError(error) {
    let errorMessage = 'Error desconocido';
    let errorCode = 'UNKNOWN_ERROR';

    if (error.name === 'AbortError') {
      errorMessage = 'La petición ha excedido el tiempo límite';
      errorCode = 'TIMEOUT_ERROR';
    } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      errorMessage = 'Error de conexión. Verifique su conexión a internet';
      errorCode = 'CONNECTION_ERROR';
    } else if (error.message.includes('HTTP Error')) {
      errorMessage = 'Error del servidor. Intente más tarde';
      errorCode = 'SERVER_ERROR';
    } else {
      errorMessage = error.message;
    }

    console.error('ApiServiceCertificados Error:', {
      message: errorMessage,
      code: errorCode,
      originalError: error,
      timestamp: new Date().toISOString()
    });

    return {
      success: false,
      error: {
        message: errorMessage,
        code: errorCode,
        details: error
      },
      data: null,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Interpretar respuesta del servidor
   */
  interpretServerResponse(serverResponse, operationType = 'general') {
    console.log('🔍 [CERT] Interpretando respuesta del servidor:', serverResponse);
    console.log('📋 [CERT] Tipo de operación:', operationType);

    if (!serverResponse) {
      return {
        success: false,
        error: {
          message: 'No se recibió respuesta del servidor',
          code: 'NO_RESPONSE'
        }
      };
    }

    const estado = serverResponse.estado || serverResponse.status || 'unknown';
    const mensaje = serverResponse.msg || serverResponse.message || '';

    console.log('📊 [CERT] Estado recibido:', estado);
    console.log('💬 [CERT] Mensaje recibido:', mensaje);

    // Estado 000 = éxito
    if (estado === '000') {
      return {
        success: true,
        data: serverResponse,
        message: mensaje || 'Operación exitosa'
      };
    } else {
      return {
        success: false,
        error: {
          message: mensaje || 'Error en la operación',
          code: estado,
          serverState: estado
        }
      };
    }
  }

  /**
   * Obtener cédula del usuario desde la sesión
   */
  getUserCedula() {
    try {
      const session = sessionStorage.getItem('userSession');
      if (!session) {
        console.log('❌ [CERT] No hay sesión activa');
        return null;
      }

      const sessionData = JSON.parse(session);
      
      // Intentar múltiples rutas para obtener la cédula
      let cedula = null;

      if (sessionData.userData?.cliente && Array.isArray(sessionData.userData.cliente) && sessionData.userData.cliente[0]?.idecli) {
        cedula = sessionData.userData.cliente[0].idecli;
      } else if (sessionData.userData?.cliente?.idecli) {
        cedula = sessionData.userData.cliente.idecli;
      } else if (sessionData.userData?.idecli) {
        cedula = sessionData.userData.idecli;
      } else if (sessionData.identificacion) {
        cedula = sessionData.identificacion;
      }

      console.log('✅ [CERT] Cédula obtenida:', cedula);
      return cedula;

    } catch (error) {
      console.error('❌ [CERT] Error obteniendo cédula:', error);
      return null;
    }
  }

  /**
   * ==========================================
   * SERVICIOS DE CERTIFICADOS
   * ==========================================
   */

  /**
   * Obtener el costo del certificado
   * Servicio: 2400
   */
  async getCertificateCost(cedula = null) {
    console.log('💰 [CERT] Obteniendo costo del certificado');

    // Si no se proporciona cédula, obtenerla de la sesión
    const idecl = cedula || this.getUserCedula();
    
    if (!idecl) {
      return {
        success: false,
        error: {
          message: 'No se pudo obtener la identificación del usuario',
          code: 'NO_USER_ID'
        }
      };
    }

    const costData = {
      prccode: this.processCodes.GET_CERTIFICATE_COST,
      idecl: idecl.trim()
    };

    console.log('📤 [CERT] Solicitando costo:', costData);

    const result = await this.makeRequest(costData);

    if (result.success) {
      const costResult = this.interpretServerResponse(result.data, 'certificate_cost');

      if (costResult.success && result.data.valcms) {
        console.log('✅ [CERT] Costo obtenido exitosamente:', result.data.valcms);

        return {
          success: true,
          data: {
            costo: parseFloat(result.data.valcms),
            mensaje: result.data.msg
          },
          message: `Costo del certificado: $${result.data.valcms}`
        };
      } else {
        return {
          success: false,
          error: {
            message: costResult.error?.message || 'No se pudo obtener el costo del certificado',
            code: 'COST_ERROR'
          }
        };
      }
    }

    return result;
  }

  /**
   * Obtener TODAS las cuentas del usuario (sin filtrar por saldo)
   * Para que el usuario pueda seleccionar de cuál cuenta quiere el certificado
   * 
   * Usa el servicio 2300 que devuelve todas las cuentas activas
   */
  async getAllUserAccounts(cedula = null) {
    console.log('🏦 [CERT] ===== OBTENIENDO TODAS LAS CUENTAS DEL USUARIO =====');

    const idecl = cedula || this.getUserCedula();
    
    if (!idecl) {
      return {
        success: false,
        error: {
          message: 'No se pudo obtener la identificación del usuario',
          code: 'NO_USER_ID'
        }
      };
    }

    try {
      const allAccountsData = {
        prccode: '2300', // Servicio de cuentas origen
        idecl: idecl.trim()
      };

      console.log('📤 [CERT] Solicitando todas las cuentas del usuario...');
      const result = await this.makeRequest(allAccountsData);

      if (!result.success) {
        return result;
      }

      const accountsResult = this.interpretServerResponse(result.data, 'all_user_accounts');

      if (!accountsResult.success || !result.data.cliente?.cuentas || !Array.isArray(result.data.cliente.cuentas)) {
        return {
          success: false,
          error: {
            message: 'No se encontraron cuentas asociadas',
            code: 'NO_ACCOUNTS'
          }
        };
      }

      // Formatear todas las cuentas
      const cuentasFormateadas = result.data.cliente.cuentas.map(cuenta => {
        const saldoDisp = parseFloat(cuenta.saldis) || 0;
        const saldoCont = parseFloat(cuenta.salcnt) || 0;
        
        return {
          // Campos principales
          codigo: cuenta.codcta,
          numeroCuenta: cuenta.codcta,
          descripcion: cuenta.desdep || 'Cuenta de Ahorros',
          estado: cuenta.desect || 'ACTIVA',
          
          // Saldos
          saldoContable: saldoCont,
          saldoDisponible: saldoDisp,
          saldo: saldoDisp,
          
          // Campos adicionales
          tipo: cuenta.desdep || 'Cuenta de Ahorros',
          tipoProducto: cuenta.desdep || 'Cuenta de Ahorros',
          numero: cuenta.codcta,
          
          // Formateados
          numeroFormateado: this.formatAccountNumber(cuenta.codcta),
          saldoFormateado: this.formatCurrency(saldoDisp),
          
          // Flags
          isActive: cuenta.desect === 'ACTIVA',
          hasBalance: saldoDisp > 0,
          
          _original: cuenta
        };
      });

      console.log('✅ [CERT] Total de cuentas formateadas:', cuentasFormateadas.length);

      return {
        success: true,
        data: {
          cuentas: cuentasFormateadas,
          totalCuentas: cuentasFormateadas.length
        },
        message: `Se encontraron ${cuentasFormateadas.length} cuenta(s)`
      };

    } catch (error) {
      console.error('💥 [CERT] Error obteniendo todas las cuentas:', error);
      return {
        success: false,
        error: {
          message: error.message || 'Error al obtener las cuentas',
          code: 'GET_ALL_ACCOUNTS_ERROR'
        }
      };
    }
  }

  /**
   * Obtener cuentas disponibles para debitar el costo
   * Servicio: 2374 (devuelve solo cuentas con saldo suficiente, sin info de saldo)
   * Servicio: 2300 (devuelve todas las cuentas con saldo detallado)
   * 
   * ESTRATEGIA: Combinar ambos servicios
   * 1. Llamar 2374 para obtener códigos de cuentas con saldo suficiente
   * 2. Llamar 2300 para obtener detalles y saldos de todas las cuentas
   * 3. Filtrar las cuentas de 2300 que estén en la lista de 2374
   * 
   * Respuesta 2374:
   * {
   *   "estado": "000",
   *   "msg": "CORRECTO",
   *   "listado": [
   *     {
   *       "codcta": "420101306290",
   *       "descri": "AHORROS A LA VISTA",
   *       "desect": "ACTIVA"
   *     }
   *   ]
   * }
   * 
   * Respuesta 2300:
   * {
   *   "estado": "000",
   *   "cliente": {
   *     "cuentas": [
   *       {
   *         "codcta": "420101306290",
   *         "desdep": "AHORROS A LA VISTA",
   *         "salcnt": "1000.50",
   *         "saldis": "950.25",
   *         "desect": "ACTIVA"
   *       }
   *     ]
   *   }
   * }
   */
  async getDebitAccounts(cedula = null, valorDebito = null) {
    console.log('🏦 [CERT] ===== OBTENIENDO CUENTAS PARA DEBITAR =====');
    console.log('🏦 [CERT] Cédula recibida:', cedula);
    console.log('💰 [CERT] Valor a debitar:', valorDebito);

    // Si no se proporciona cédula, obtenerla de la sesión
    const idecl = cedula || this.getUserCedula();
    
    if (!idecl) {
      return {
        success: false,
        error: {
          message: 'No se pudo obtener la identificación del usuario',
          code: 'NO_USER_ID'
        }
      };
    }

    try {
      // PASO 1: Obtener códigos de cuentas con saldo suficiente (2374)
      const accountsData = {
        prccode: this.processCodes.GET_DEBIT_ACCOUNTS,
        idecl: idecl.trim()
      };

      if (valorDebito) {
        accountsData.valinver = valorDebito.toString();
        console.log('💵 [CERT] Agregando valinver al payload:', accountsData.valinver);
      }

      console.log('📤 [CERT] PASO 1: Solicitando cuentas con saldo suficiente (2374)...');
      const result2374 = await this.makeRequest(accountsData);

      console.log('📥 [CERT] Respuesta de 2374:', JSON.stringify(result2374, null, 2));

      if (!result2374.success) {
        return result2374;
      }

      const accountsResult = this.interpretServerResponse(result2374.data, 'debit_accounts');

      if (!accountsResult.success || !result2374.data.listado || !Array.isArray(result2374.data.listado)) {
        console.log('❌ [CERT] No se encontraron cuentas en 2374');
        return {
          success: false,
          error: {
            message: valorDebito 
              ? `No tiene cuentas con saldo suficiente para cubrir el costo de $${valorDebito}`
              : 'No se encontraron cuentas disponibles',
            code: 'INSUFFICIENT_FUNDS'
          }
        };
      }

      // Extraer códigos de cuentas válidas
      const codigosCuentasValidas = result2374.data.listado.map(cuenta => cuenta.codcta);
      console.log('✅ [CERT] Códigos de cuentas con saldo suficiente:', codigosCuentasValidas);

      if (codigosCuentasValidas.length === 0) {
        return {
          success: false,
          error: {
            message: valorDebito 
              ? `No tiene cuentas con saldo suficiente para cubrir el costo de $${valorDebito}`
              : 'No se encontraron cuentas disponibles',
            code: 'INSUFFICIENT_FUNDS'
          }
        };
      }

      // PASO 2: Obtener detalles completos de todas las cuentas (2300)
      console.log('📤 [CERT] PASO 2: Obteniendo detalles de cuentas (2300)...');
      
      const allAccountsData = {
        prccode: '2300', // Servicio de cuentas origen (usado en transferencias)
        idecl: idecl.trim()
      };

      const result2300 = await this.makeRequest(allAccountsData);
      console.log('📥 [CERT] Respuesta de 2300:', JSON.stringify(result2300, null, 2));

      if (!result2300.success) {
        return result2300;
      }

      const allAccountsResult = this.interpretServerResponse(result2300.data, 'all_accounts');

      if (!allAccountsResult.success || !result2300.data.cliente?.cuentas || !Array.isArray(result2300.data.cliente.cuentas)) {
        console.log('❌ [CERT] No se encontraron cuentas en 2300');
        return {
          success: false,
          error: {
            message: 'No se pudieron obtener los detalles de las cuentas',
            code: 'NO_ACCOUNT_DETAILS'
          }
        };
      }

      // PASO 3: Filtrar y combinar datos
      console.log('🔄 [CERT] PASO 3: Filtrando y combinando datos...');
      
      const cuentasConDetalles = result2300.data.cliente.cuentas
        .filter(cuenta => codigosCuentasValidas.includes(cuenta.codcta))
        .map(cuenta => {
          const saldoDisp = parseFloat(cuenta.saldis) || 0;
          const saldoCont = parseFloat(cuenta.salcnt) || 0;
          
          return {
            // Campos principales
            codigo: cuenta.codcta,
            numeroCuenta: cuenta.codcta,
            descripcion: cuenta.desdep || 'Cuenta de Ahorros',
            estado: cuenta.desect || 'ACTIVA',
            
            // Saldos (múltiples formatos para compatibilidad)
            saldoContable: saldoCont,
            saldoDisponible: saldoDisp,
            saldo: saldoDisp, // Alias para compatibilidad con el formulario
            
            // Campos adicionales para compatibilidad
            tipo: cuenta.desdep || 'Cuenta de Ahorros',
            tipoProducto: cuenta.desdep || 'Cuenta de Ahorros',
            numero: cuenta.codcta,
            
            // Campos formateados
            numeroFormateado: this.formatAccountNumber(cuenta.codcta),
            saldoFormateado: this.formatCurrency(saldoDisp),
            
            // Flags
            tieneSaldoSuficiente: true, // Ya está filtrada por 2374
            isActive: cuenta.desect === 'ACTIVA',
            hasBalance: saldoDisp > 0,
            
            // Original para referencia
            _original: cuenta
          };
        });

      console.log('✅ [CERT] Cuentas con detalles completos:', cuentasConDetalles.length);
      
      // Log detallado de cada cuenta
      cuentasConDetalles.forEach((cuenta, index) => {
        console.log(`📋 [CERT] Cuenta ${index + 1}:`, {
          codigo: cuenta.codigo,
          descripcion: cuenta.descripcion,
          saldoDisponible: cuenta.saldoDisponible,
          saldoFormateado: cuenta.saldoFormateado
        });
      });

      return {
        success: true,
        data: {
          cuentas: cuentasConDetalles,
          mensaje: result2374.data.msg,
          valorDebito: valorDebito,
          totalCuentas: cuentasConDetalles.length
        },
        message: `Se encontraron ${cuentasConDetalles.length} cuenta(s) disponible(s)`
      };

    } catch (error) {
      console.error('💥 [CERT] Error obteniendo cuentas:', error);
      return {
        success: false,
        error: {
          message: error.message || 'Error al obtener cuentas disponibles',
          code: 'GET_ACCOUNTS_ERROR'
        }
      };
    }
  }

  /**
   * Formatear número de cuenta (ocultar dígitos centrales)
   */
  formatAccountNumber(accountNumber) {
    if (!accountNumber) return '';
    const str = accountNumber.toString();
    if (str.length >= 4) {
      const visiblePart = str.slice(-4);
      const hiddenPart = '*'.repeat(Math.max(0, str.length - 4));
      return `${hiddenPart}${visiblePart}`.replace(/(.{4})/g, '$1 ').trim();
    }
    return str;
  }

  /**
   * Formatear moneda
   */
  formatCurrency(amount) {
    return new Intl.NumberFormat('es-EC', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  /**
   * Validar débito de certificado y solicitar código OTP
   * Servicio: 2350 (similar al flujo de transferencias)
   * 
   * Este servicio:
   * 1. Valida que la cuenta tenga saldo suficiente
   * 2. Envía código OTP al usuario (SMS/Email)
   * 3. Retorna idemsg para usar en la confirmación
   * 
   * @param {string} cedula - Cédula del cliente
   * @param {string} codigoCuenta - Cuenta a debitar
   * @param {number} valor - Monto del certificado
   * @returns {Promise} idemsg para confirmación
   */
  async validateCertificateDebit(cedula = null, codigoCuenta, valor) {
    console.log('🔐 [CERT] Validando débito y solicitando OTP...');
    console.log('🏦 [CERT] Cuenta:', codigoCuenta);
    console.log('💰 [CERT] Valor:', valor);

    const idecl = cedula || this.getUserCedula();
    
    if (!idecl) {
      return {
        success: false,
        error: {
          message: 'No se pudo obtener la identificación del usuario',
          code: 'NO_USER_ID'
        }
      };
    }

    const validateData = {
      prccode: this.processCodes.VALIDATE_DEBIT,
      idecl: idecl.trim(),
      codctad: codigoCuenta.trim(),
      valtrnf: valor.toString(),
      tiptrnf: '1' // Tipo de transacción: débito certificado
    };

    console.log('📤 [CERT] Solicitando validación y OTP:', validateData);

    const result = await this.makeRequest(validateData);

    if (result.success) {
      const estado = result.data.estado || 'unknown';
      const mensaje = result.data.msg || '';
      const idemsg = result.data.idemsg || result.data.idMsg || '';

      console.log('📊 [CERT] Estado validación:', estado);
      console.log('💬 [CERT] Mensaje:', mensaje);
      console.log('🔑 [CERT] ID Mensaje (idemsg):', idemsg);

      if (estado === '000' && idemsg) {
        console.log('✅ [CERT] OTP enviado correctamente');
        return {
          success: true,
          data: {
            idemsg: idemsg,
            mensaje: mensaje,
            otpEnviado: true
          },
          message: 'Código de seguridad enviado correctamente'
        };
      } else {
        return {
          success: false,
          error: {
            message: mensaje || 'Error al validar el débito',
            code: `VALIDATION_ERROR_${estado}`,
            serverState: estado
          }
        };
      }
    }

    return result;
  }

  /**
   * Registrar débito del certificado CON código OTP
   * Servicio: 2401 (actualizado para incluir OTP)
   * 
   * @param {string} cedula - Cédula del cliente
   * @param {string} codigoCuenta - Código de la cuenta a debitar
   * @param {number} valor - Monto del certificado
   * @param {string} idemsg - ID del mensaje OTP (retornado por validateCertificateDebit)
   * @param {string} codigoOTP - Código OTP ingresado por el usuario
   * @param {string} tipoVisualizacion - 'saldo' o 'cifras'
   * @returns {Promise} Confirmación del débito
   */
  async generateConsolidatedCertificateWithOTP(cedula = null, codigoCuenta, valor, idemsg, codigoOTP, tipoVisualizacion = 'saldo') {
    console.log('📄 [CERT] Registrando débito del certificado CON OTP...');
    console.log('🏦 [CERT] Cuenta a debitar:', codigoCuenta);
    console.log('💰 [CERT] Valor:', valor);
    console.log('🔑 [CERT] ID Mensaje:', idemsg);
    console.log('📊 [CERT] Tipo visualización:', tipoVisualizacion);

    const idecl = cedula || this.getUserCedula();
    
    if (!idecl) {
      return {
        success: false,
        error: {
          message: 'No se pudo obtener la identificación del usuario',
          code: 'NO_USER_ID'
        }
      };
    }

    if (!codigoCuenta || !idemsg || !codigoOTP) {
      return {
        success: false,
        error: {
          message: 'Datos incompletos para registrar el débito',
          code: 'INCOMPLETE_DATA'
        }
      };
    }

    const certificateData = {
      prccode: this.processCodes.GENERATE_CERTIFICATE,
      idecl: idecl.trim(),
      codcta: codigoCuenta.trim(),
      valtrnf: valor.toString(),
      idemsg: idemsg.trim(),
      codseg: codigoOTP.trim(),
      tpvisu: tipoVisualizacion === 'cifras' ? '2' : '1'
    };

    console.log('📤 [CERT] Solicitando débito CON OTP:', certificateData);

    const result = await this.makeRequest(certificateData);

    if (result.success) {
      const estado = result.data.estado || 'unknown';
      const mensaje = result.data.msg || '';

      console.log('📊 [CERT] Estado del débito:', estado);
      console.log('💬 [CERT] Mensaje del servidor:', mensaje);
      console.log('📋 [CERT] RESPUESTA COMPLETA DEL DÉBITO:', JSON.stringify(result.data, null, 2));

      if (estado === '000') {
        console.log('✅ [CERT] Débito registrado correctamente con OTP');
        
        return {
          success: true,
          data: {
            debitoConfirmado: true,
            mensaje: 'Débito registrado exitosamente',
            estado: estado,
            fechaDebito: new Date().toISOString(),
            tipoVisualizacion: tipoVisualizacion,
            cuentaDebitada: codigoCuenta,
            valorDebitado: valor
          },
          message: 'Débito procesado correctamente. El PDF se generará en el navegador.'
        };
      } else {
        console.error('❌ [CERT] Error en el débito:', mensaje);
        
        return {
          success: false,
          error: {
            message: mensaje || 'Error al procesar el débito del certificado',
            code: `DEBIT_ERROR_${estado}`,
            serverState: estado
          }
        };
      }
    }

    return result;
  }

  /**
   * Registrar débito del certificado (VERSIÓN SIN OTP - DEPRECADA)
   * 
   * IMPORTANTE: Este servicio solo DEBITA la cuenta y confirma la transacción.
   * NO devuelve los datos del certificado. El PDF se genera en el frontend.
   * 
   * Respuesta esperada del backend:
   * - Estado "000" = Débito exitoso
   * - Estado "003" o "SIN CONTENIDO" = Normal (el backend no genera PDF)
   * 
   * @param {string} cedula - Cédula del cliente
   * @param {string} codigoCuenta - Código de la cuenta a debitar
   * @param {string} tipoVisualizacion - 'saldo' o 'cifras'
   * @returns {Promise} Confirmación del débito
   */
  async generateConsolidatedCertificate(cedula = null, codigoCuenta, tipoVisualizacion = 'saldo') {
    console.log('📄 [CERT] Registrando débito del certificado...');
    console.log('🏦 [CERT] Cuenta a debitar:', codigoCuenta);
    console.log('📊 [CERT] Tipo visualización:', tipoVisualizacion);

    // Si no se proporciona cédula, obtenerla de la sesión
    const idecl = cedula || this.getUserCedula();
    
    if (!idecl) {
      return {
        success: false,
        error: {
          message: 'No se pudo obtener la identificación del usuario',
          code: 'NO_USER_ID'
        }
      };
    }

    if (!codigoCuenta) {
      return {
        success: false,
        error: {
          message: 'Se requiere seleccionar una cuenta para debitar',
          code: 'NO_ACCOUNT_SELECTED'
        }
      };
    }

    const certificateData = {
      prccode: this.processCodes.GENERATE_CERTIFICATE,
      idecl: idecl.trim(),
      codcta: codigoCuenta.trim(),
      tpvisu: tipoVisualizacion === 'cifras' ? '2' : '1' // 1 = saldo, 2 = cifras
    };

    console.log('📤 [CERT] Solicitando débito del certificado:', certificateData);

    const result = await this.makeRequest(certificateData);

    if (result.success) {
      const estado = result.data.estado || 'unknown';
      const mensaje = result.data.msg || '';

      console.log('📊 [CERT] Estado del débito:', estado);
      console.log('💬 [CERT] Mensaje del servidor:', mensaje);
      console.log('📋 [CERT] RESPUESTA COMPLETA DEL DÉBITO:', JSON.stringify(result.data, null, 2));

      // Estado "000" = débito exitoso
      // Estado "003" o mensaje "SIN CONTENIDO" = también es válido (el backend no genera PDF)
      if (estado === '000' || estado === '003' || mensaje === 'SIN CONTENIDO') {
        console.log('✅ [CERT] Débito registrado correctamente');
        
        return {
          success: true,
          data: {
            debitoConfirmado: true,
            mensaje: estado === '000' ? 'Débito registrado exitosamente' : 'Transacción procesada',
            estado: estado,
            fechaDebito: new Date().toISOString(),
            tipoVisualizacion: tipoVisualizacion,
            cuentaDebitada: codigoCuenta
          },
          message: 'Débito procesado correctamente. El PDF se generará en el navegador.'
        };
      } else {
        // Cualquier otro estado es un error real
        console.error('❌ [CERT] Error en el débito:', mensaje);
        
        return {
          success: false,
          error: {
            message: mensaje || 'Error al procesar el débito del certificado',
            code: `DEBIT_ERROR_${estado}`,
            serverState: estado
          }
        };
      }
    }

    return result;
  }

  /**
   * Obtener todos los productos del usuario para el certificado consolidado
   * Llama a múltiples servicios para obtener: cuentas, inversiones, créditos
   * 
   * @param {string} cedula - Cédula del cliente
   * @returns {Promise} Todos los productos del usuario
   */
  async getAllUserProducts(cedula = null) {
    console.log('📦 [CERT] Obteniendo todos los productos del usuario...');

    const idecl = cedula || this.getUserCedula();
    
    if (!idecl) {
      return {
        success: false,
        error: {
          message: 'No se pudo obtener la identificación del usuario',
          code: 'NO_USER_ID'
        }
      };
    }

    try {
      const productos = {
        ahorros: [],
        inversiones: [],
        creditos: []
      };

      // 1. Obtener cuentas de ahorro (servicio 2201 con prdfi=2)
      console.log('💰 [CERT] Obteniendo cuentas de ahorro...');
      const ahorrosData = {
        prccode: '2201',
        idecl: idecl.trim(),
        prdfi: '2' // Tipo producto: Ahorros
      };

      const ahorrosResult = await this.makeRequest(ahorrosData);
      if (ahorrosResult.success && ahorrosResult.data.cliente?.cuentas) {
        productos.ahorros = ahorrosResult.data.cliente.cuentas.map(cuenta => ({
          tipo: 'Ahorro',
          numero: cuenta.codcta || cuenta.numeroCuenta,
          descripcion: cuenta.desdep || 'Cuenta de Ahorro',
          estado: cuenta.desect || 'ACTIVA',
          saldo: parseFloat(cuenta.saldis || cuenta.saldo || 0),
          saldoContable: parseFloat(cuenta.salcnt || 0)
        }));
        console.log(`✅ [CERT] Cuentas de ahorro obtenidas: ${productos.ahorros.length}`);
      }

      // 2. Obtener inversiones (servicio 2201 con prdfi=4)
      console.log('💼 [CERT] Obteniendo inversiones...');
      const inversionesData = {
        prccode: '2201',
        idecl: idecl.trim(),
        prdfi: '4' // Tipo producto: Inversiones
      };

      const inversionesResult = await this.makeRequest(inversionesData);
      if (inversionesResult.success && inversionesResult.data.cliente?.cuentas) {
        productos.inversiones = inversionesResult.data.cliente.cuentas.map(inversion => ({
          tipo: 'Inversión',
          numero: inversion.codcta || inversion.numeroCuenta,
          descripcion: inversion.desdep || 'Inversión',
          estado: inversion.desect || 'ACTIVA',
          saldo: parseFloat(inversion.saldis || inversion.saldo || 0),
          saldoContable: parseFloat(inversion.salcnt || 0)
        }));
        console.log(`✅ [CERT] Inversiones obtenidas: ${productos.inversiones.length}`);
      }

      // 3. Obtener créditos (servicio 2201 con prdfi=1)
      console.log('💳 [CERT] Obteniendo créditos...');
      const creditosData = {
        prccode: '2201',
        idecl: idecl.trim(),
        prdfi: '1' // Tipo producto: Créditos
      };

      const creditosResult = await this.makeRequest(creditosData);
      if (creditosResult.success && creditosResult.data.cliente?.cuentas) {
        productos.creditos = creditosResult.data.cliente.cuentas.map(credito => ({
          tipo: 'Crédito',
          numero: credito.codcta || credito.numeroCuenta,
          descripcion: credito.desdep || 'Crédito',
          estado: credito.desect || 'ACTIVA',
          saldo: parseFloat(credito.saldis || credito.saldo || 0),
          saldoContable: parseFloat(credito.salcnt || 0)
        }));
        console.log(`✅ [CERT] Créditos obtenidos: ${productos.creditos.length}`);
      }

      // Combinar todos los productos
      const todosLosProductos = [
        ...productos.ahorros,
        ...productos.inversiones,
        ...productos.creditos
      ];

      console.log(`✅ [CERT] Total de productos obtenidos: ${todosLosProductos.length}`);

      return {
        success: true,
        data: {
          productos: todosLosProductos,
          resumen: {
            totalAhorros: productos.ahorros.length,
            totalInversiones: productos.inversiones.length,
            totalCreditos: productos.creditos.length,
            totalProductos: todosLosProductos.length
          }
        },
        message: `Se obtuvieron ${todosLosProductos.length} productos`
      };

    } catch (error) {
      console.error('💥 [CERT] Error obteniendo productos:', error);
      return {
        success: false,
        error: {
          message: error.message || 'Error al obtener los productos del usuario',
          code: 'GET_PRODUCTS_ERROR'
        }
      };
    }
  }

  /**
   * Proceso completo: Obtener costo, validar cuenta de pago, registrar débito y obtener datos de la cuenta
   * 
   * @param {string} codigoCuentaCertificado - Cuenta de la cual se genera el certificado
   * @param {string} codigoCuentaPago - Cuenta desde la cual se debita el costo
   * @param {string} tipoVisualizacion - 'saldo' o 'cifras'
   */
  async generateCertificateWithDebit(codigoCuentaCertificado, codigoCuentaPago, tipoVisualizacion = 'saldo') {
    console.log('🔄 [CERT] Iniciando proceso completo de generación de certificado');
    console.log('📄 [CERT] Cuenta del certificado:', codigoCuentaCertificado);
    console.log('💳 [CERT] Cuenta de pago:', codigoCuentaPago);

    const cedula = this.getUserCedula();
    if (!cedula) {
      return {
        success: false,
        error: {
          message: 'No se pudo obtener la identificación del usuario',
          code: 'NO_USER_ID'
        }
      };
    }

    try {
      // Paso 1: Obtener costo
      console.log('📍 [CERT] Paso 1: Obteniendo costo...');
      const costResult = await this.getCertificateCost(cedula);
      
      if (!costResult.success) {
        return costResult;
      }

      const costo = costResult.data.costo;
      console.log('💰 [CERT] Costo obtenido: $', costo);

      // Paso 2: Validar que la cuenta de PAGO tenga saldo suficiente
      console.log('📍 [CERT] Paso 2: Validando cuenta de pago...');
      const accountsResult = await this.getDebitAccounts(cedula, costo);
      
      if (!accountsResult.success) {
        return accountsResult;
      }

      // Buscar la cuenta de pago seleccionada
      const cuentaPago = accountsResult.data.cuentas.find(
        cuenta => cuenta.codigo === codigoCuentaPago || cuenta.numeroCuenta === codigoCuentaPago
      );

      if (!cuentaPago) {
        console.log('❌ [CERT] Cuenta de pago no encontrada o sin saldo suficiente:', codigoCuentaPago);
        return {
          success: false,
          error: {
            message: 'La cuenta de pago seleccionada no tiene saldo suficiente',
            code: 'INSUFFICIENT_FUNDS'
          }
        };
      }

      console.log('✅ [CERT] Cuenta de pago validada:', cuentaPago);

      // Paso 3: Obtener datos de la cuenta del certificado
      console.log('📍 [CERT] Paso 3: Obteniendo datos de la cuenta del certificado...');
      const allAccountsResult = await this.getAllUserAccounts(cedula);
      
      if (!allAccountsResult.success) {
        return allAccountsResult;
      }

      const cuentaCertificado = allAccountsResult.data.cuentas.find(
        cuenta => cuenta.codigo === codigoCuentaCertificado || cuenta.numeroCuenta === codigoCuentaCertificado
      );

      if (!cuentaCertificado) {
        return {
          success: false,
          error: {
            message: 'No se encontró la cuenta del certificado',
            code: 'CERTIFICATE_ACCOUNT_NOT_FOUND'
          }
        };
      }

      console.log('✅ [CERT] Cuenta del certificado encontrada:', cuentaCertificado);

      // Paso 4: Registrar débito del certificado (servicio 2401)
      console.log('📍 [CERT] Paso 4: Registrando débito en cuenta de pago...');
      const debitResult = await this.generateConsolidatedCertificate(
        cedula,
        codigoCuentaPago, // Debitar de la cuenta de PAGO
        tipoVisualizacion
      );

      if (!debitResult.success) {
        return debitResult;
      }

      console.log('✅ [CERT] Débito registrado correctamente en cuenta de pago');

      // Obtener datos del cliente de la sesión
      const session = JSON.parse(sessionStorage.getItem('userSession') || '{}');
      const clienteInfo = session.userData?.cliente?.[0] || {};

      console.log('🎉 [CERT] Proceso completado exitosamente');

      return {
        success: true,
        data: {
          ...debitResult.data,
          costo: costo,
          cuentaPago: cuentaPago, // Cuenta desde donde se pagó
          cuentaCertificado: cuentaCertificado, // Cuenta del certificado
          cliente: {
            nombre: clienteInfo.nombre || `${clienteInfo.nomcli || ''} ${clienteInfo.apecli || ''}`.trim(),
            cedula: clienteInfo.idecli || cedula,
            codigo: clienteInfo.codcli || ''
          }
        },
        message: 'Certificado generado y débito procesado correctamente'
      };

    } catch (error) {
      console.error('💥 [CERT] Error en proceso completo:', error);
      return {
        success: false,
        error: {
          message: error.message || 'Error durante el proceso de generación',
          code: 'PROCESS_ERROR'
        }
      };
    }
  }
}

// Exportar instancia única del servicio
const apiServiceCertificados = new ApiServiceCertificados();
export default apiServiceCertificados;
